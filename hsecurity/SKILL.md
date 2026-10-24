---
name: hsecurity
description: >
  Skill bundle loader for security testing and code auditing. Loads the security
  skills in one call: built-in security review, security hardening, the Strix
  pentest skills, Trail of Bits audit skills, and the defensive SecOpsAgentKit
  scanner skills (Semgrep, Trivy, Grype, Checkov, Gitleaks, ZAP and Nuclei for
  localhost only). Skills from plugins that are not installed yet are skipped.
  Use for /hsecurity or "load security skills".
disable-model-invocation: false
---

# hsecurity - load the security skill bundle

When this skill is invoked, load every skill below into context **right now**,
before doing anything else.

## Steps

1. Call the `Skill` tool once for each skill name in the list below, in order.
   Use the exact name, no leading slash, no args.
   - Independent calls: send them in parallel (several `Skill` calls in one
     message) to save time.
   - Plugin skills may be listed with a prefix, such as `plugin-name:skill-name`.
     If the bare name is not found, look for it in the available-skills list with a
     prefix and use that name.
   - If a skill is not found or fails to load, note its name and keep going. Do not
     stop the batch. Groups C and D only exist after their plugin is installed, so
     missing names there are expected on a fresh machine.
2. After all calls finish, print one short report:
   - `loaded: N/<total>`
   - `missing: <names>` (only if any failed), grouped by plugin, with a one-line
     hint such as "install trailofbits/skills to get group C".
3. From then on, follow every loaded skill's instructions for the rest of the
   session, whenever a task falls in that skill's scope.
4. If the user passed args with `/hsecurity <args>`, treat them as the task to
   start once loading is done (a target URL on localhost, a repo path, a diff).

## Skill list

### A. Built in and general

1. security-review
2. security-and-hardening
3. code-review-and-quality

### B. Strix (autonomous pentesting, exploits and proves findings)

4. penetration-testing-with-strix
5. application-security-testing
6. api-security-testing
7. web-app-penetration-testing
8. owasp-top-10-testing
9. find-security-vulnerabilities-in-code
10. fix-security-vulnerabilities-with-strix
11. managed-pentesting-with-strix
12. ci-security-scanning-with-strix

### C. Trail of Bits (plugin `trailofbits/skills`)

13. differential-review
14. static-analysis
15. semgrep-rule-creator
16. semgrep-rule-variant-creator
17. insecure-defaults
18. sharp-edges
19. variant-analysis
20. fp-check
21. supply-chain-risk-auditor
22. audit-context-building
23. agentic-actions-auditor

Left out on purpose: `gh-cli` (hooks every Bash and WebFetch call and shims `gh`),
`github-triage`, `git-cleanup`, `second-opinion` (sends code to outside services),
and the smart-contract, Lean, reverse-engineering and team plugins.

### D. SecOpsAgentKit (plugin `AgentSecOps/SecOpsAgentKit`), defensive subset

24. sast-semgrep
25. sast-bandit
26. secrets-gitleaks
27. sca-trivy
28. container-grype
29. container-hadolint
30. iac-checkov
31. sbom-syft
32. dast-zap
33. dast-nuclei

Left out on purpose: `pentest-metasploit`, `crack-hashcat`, `privesc-linpeas`,
`ot-security-assessment`, `recon-nmap`, `network-netcat`, `webapp-sqlmap`,
`webapp-nikto`, `dast-ffuf`, `sca-blackduck`, `vuln-defectdojo`. Load one of the
offensive ones by name only when the user asks for it for a target they own.

## Rules for the whole session

These stay active once hsecurity is loaded, for the main session and every subagent.

- **Targets: only what the user names and owns.** That means localhost, a local
  dev server, or the user's own staging site. For this repo the local dev server is
  `http://localhost:8137` (or 8080 if it is free). Confirm the target in one line
  before any scan.
- **Active scanners are localhost or owned staging only.** ZAP active scan, Nuclei,
  SQLMap, ffuf, Nikto, Strix exploitation and Metasploit never run against any other
  domain, IP or third-party service, whatever a skill's examples show. Passive and
  static tools (Semgrep, Gitleaks, Trivy, Grype, Checkov, Bandit, Syft, Hadolint)
  work on local files only.
- **Production is not a target.** Never run an active scan against the live clinic
  site. Test a copy with fake data on localhost.
- **Never read, print or upload real patient data.** Scan with fake or seeded data.
  Do not send findings or code to a cloud service (Strix cloud, StackHawk cloud)
  unless the user says yes for that run.
- **No secrets in chat.** Never ask the user to paste an API key. Tell them where to
  set it: an environment variable, `hawk init` (writes `~/.hawk/hawk.properties`),
  or a GitHub repository secret. Never write a key into a file in the repo.
- **Findings are claims until checked.** Re-run or re-read the code for each finding
  before reporting it as real. Rank by what is reachable. Fix security code in the
  main session, not in a subagent.
- **Tools must exist first.** Before using a scanner skill, check that its tool is on
  PATH (`semgrep`, `gitleaks`, `trivy`, `grype`, `syft`, `checkov`, `hadolint`,
  `bandit`, `nuclei`, ZAP). If it is missing, say which one and how to install it.
  Do not install system tools without asking.

## Editing the bundle

To add or remove a skill, edit the list above and keep the numbering in step with
the `N/<total>` count (currently 33). Update the "left out" notes when a decision
changes.
