#!/usr/bin/env python
"""vps: run commands and copy files on a VPS over SSH with a password.

Credentials come from flags or env vars (env is safer: flags show up in
shell history and process lists).

  VPS_HOST   server IP or hostname   (or --host)
  VPS_PASS   SSH password            (or --password)
  VPS_USER   login user, default root (or --user)
  VPS_PORT   SSH port, default 22     (or --port)

Examples:
  vps run "df -h; free -m"
  vps run "cat /var/log/syslog | tail -100"
  vps get /etc/nginx ./nginx-backup      # file or whole directory
  vps put ./script.sh /root/script.sh

`run` prints remote stdout/stderr and exits with the remote exit code.
Host keys are trusted on first use and saved to ~/.ssh/known_hosts;
a changed key afterwards aborts the connection.
"""
import argparse
import os
import stat
import sys
from pathlib import Path

import paramiko

KNOWN_HOSTS = Path.home() / ".ssh" / "known_hosts"


def connect(a):
    host, password = a.host or os.environ.get("VPS_HOST"), a.password or os.environ.get("VPS_PASS")
    if not host or not password:
        sys.exit("vps: need --host/VPS_HOST and --password/VPS_PASS")
    client = paramiko.SSHClient()
    KNOWN_HOSTS.parent.mkdir(exist_ok=True)
    KNOWN_HOSTS.touch(exist_ok=True)
    client.load_host_keys(str(KNOWN_HOSTS))
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(host, port=int(a.port or os.environ.get("VPS_PORT", 22)),
                       username=a.user or os.environ.get("VPS_USER", "root"),
                       password=password, timeout=15,
                       allow_agent=False, look_for_keys=False)
    except paramiko.BadHostKeyException:
        sys.exit(f"vps: host key for {host} changed. Remove its line from {KNOWN_HOSTS} if expected.")
    except (paramiko.SSHException, OSError) as e:
        sys.exit(f"vps: connect failed: {e}")
    client.save_host_keys(str(KNOWN_HOSTS))
    return client


def run(client, a):
    _, out, err = client.exec_command(a.command, timeout=a.timeout)
    # Read stderr fully after stdout; fine for agent-sized output.
    sys.stdout.buffer.write(out.read())
    sys.stderr.buffer.write(err.read())
    return out.channel.recv_exit_status()


def get(sftp, remote, local):
    if stat.S_ISDIR(sftp.stat(remote).st_mode):
        Path(local).mkdir(parents=True, exist_ok=True)
        for entry in sftp.listdir_attr(remote):
            get(sftp, f"{remote.rstrip('/')}/{entry.filename}", str(Path(local) / entry.filename))
    else:
        sftp.get(remote, local)
        print(local)


def put(sftp, local, remote):
    if Path(local).is_dir():
        try:
            sftp.mkdir(remote)
        except OSError:
            pass  # already exists
        for child in Path(local).iterdir():
            put(sftp, str(child), f"{remote.rstrip('/')}/{child.name}")
    else:
        sftp.put(local, remote)
        print(remote)


def main():
    p = argparse.ArgumentParser(prog="vps", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    for flag in ("--host", "--password", "--user", "--port"):
        p.add_argument(flag)
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run", help="run a shell command on the server")
    r.add_argument("command")
    r.add_argument("--timeout", type=float, default=300)
    g = sub.add_parser("get", help="download a file or directory")
    g.add_argument("remote")
    g.add_argument("local", nargs="?")
    u = sub.add_parser("put", help="upload a file or directory")
    u.add_argument("local")
    u.add_argument("remote")
    a = p.parse_args()

    client = connect(a)
    try:
        if a.cmd == "run":
            return run(client, a)
        with client.open_sftp() as sftp:
            try:
                if a.cmd == "get":
                    get(sftp, a.remote, a.local or Path(a.remote.rstrip("/")).name)
                else:
                    put(sftp, a.local, a.remote)
            except (OSError, IOError) as e:
                sys.exit(f"vps: {a.cmd} failed: {e}")
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    sys.exit(main())
