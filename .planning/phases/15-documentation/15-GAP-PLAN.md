---
phase: 15-documentation
plan: GAP
type: execute
wave: 1
depends_on: []
files_modified:
  - README.md
autonomous: true
requirements:
  - DOCS-01
  - DOCS-03
gap_closure: true

must_haves:
  truths:
    - "Developer can find role-specific config files from README Quick Start section"
    - "README.md includes reference to examples/configs/ directory"
    - "README.md Configuration section references role-specific configs"
  artifacts:
    - path: "README.md"
      provides: "Main project documentation with links to role-specific configs"
      contains: "examples/configs/"
  key_links:
    - from: "README.md Quick Start section"
      to: "examples/configs/minerva.config.yaml"
      via: "File path reference in 'What's Next?' bullet"
      pattern: "examples/configs/"
    - from: "README.md Configuration section"
      to: "examples/configs/*.yaml"
      via: "See examples/configs/ reference"
      pattern: "examples/configs/"
---

<objective>
Update README.md to establish the missing link between the Quick Start guide and the role-specific configuration files created in 15-02-PLAN.md.

Purpose: Close the documentation gap where developers cannot find role-specific configs from README.md. The configs exist (minerva.config.yaml, vulcan.config.yaml, worker.config.yaml) but are not referenced, making them undiscoverable.

Output: Updated README.md with examples/configs/ references in Quick Start "What's Next?" and Configuration sections.
</objective>

<execution_context>
@/home/gr3gg0rk/.claude/get-shit-done/workflows/execute-plan.md
@/home/gr3gg0rk/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/phases/15-documentation/15-VERIFICATION.md
@.planning/phases/15-documentation/15-02-PLAN.md
@README.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update README.md Quick Start "What's Next?" section</name>
  <files>README.md</files>
  <action>
    Update the "What's Next?" section in Quick Start (around line 57-61) to reference the role-specific configs directory.

    Current content:
    ```markdown
    ### What's Next?

    - Start an agent: `npm run agent` (requires config file)
    - View dashboard: `npm run dashboard` (opens at http://localhost:5173)
    - See [Configuration](#configuration) for config file examples
    ```

    Replace with:
    ```markdown
    ### What's Next?

    - Start an agent: `npm run agent` (requires config file)
    - View dashboard: `npm run dashboard` (opens at http://localhost:5173)
    - Role-specific configs: `examples/configs/minerva.config.yaml` (orchestrator), `examples/configs/vulcan.config.yaml` (builder), `examples/configs/worker.config.yaml` (flexible worker)
    - See [Configuration](#configuration) for full config reference

    The role-specific configs are fully documented with inline comments. Copy the one matching your role and update only the `brokerUrl` hostname.
    ```

    Gap reason from VERIFICATION.md: "README.md has zero occurrences of 'examples/configs/' - the link between README and role-specific configs is broken"
  </action>
  <verify>grep -n "examples/configs/" README.md | head -5</verify>
  <done>README.md contains at least 2 references to examples/configs/ (one in Quick Start, one in Configuration section)</done>
</task>

<task type="auto">
  <name>Task 2: Update README.md Configuration section to reference role-specific configs</name>
  <files>README.md</files>
  <action>
    Update the Configuration section to add a subsection for role-specific configs. This section is around line 337-372.

    After the "Agent Config (`examples/config.yaml`)" subsection (around line 360-372), add a new subsection:

    ```markdown
    ### Role-Specific Configs (`examples/configs/`)

    Fully annotated configuration files for each agent role. Copy the file matching your role and update only the `brokerUrl` hostname.

    **Available configs:**

    - **minerva.config.yaml** - Orchestrator role (delegates tasks, manages context)
      - Capabilities: code, test, debug, plan
      - Use on: griak-brain or any orchestrator machine

    - **vulcan.config.yaml** - Builder role (builds, tests, code execution)
      - Capabilities: code, test, build
      - Use on: griak-server or any dedicated builder

    - **worker.config.yaml** - Flexible worker role (general-purpose)
      - Capabilities: code, test, debug
      - Use on: griak-worker-1, griak-worker-2, or any worker machine

    Each config file includes:
    - Inline comments explaining every option
    - Mosquitto persistence warning
    - Optimization feature flags documentation
    - No placeholder values (copy-paste ready)

    Example usage:
    \`\`\`bash
    # Copy the orchestrator config
    cp examples/configs/minerva.config.yaml ./my-config.yaml

    # Edit only the brokerUrl hostname if needed
    # Then start the agent
    CONFIG_PATH=./my-config.yaml npm run agent
    \`\`\`
    ```

    Gap reason from VERIFICATION.md: "README Configuration section references examples/config.yaml but does not reference the new role-specific configs in examples/configs/"
  </action>
  <verify>grep -c "examples/configs/" README.md</verify>
  <done>README.md Configuration section includes "Role-Specific Configs" subsection with references to minerva.config.yaml, vulcan.config.yaml, and worker.config.yaml</done>
</task>

</tasks>

<verification>
After execution, verify the gap is closed:

1. README.md contains "examples/configs/" string at least 2 times
2. Quick Start "What's Next?" section references all 3 role-specific configs
3. Configuration section has new "Role-Specific Configs" subsection
4. No placeholder values mentioned (configs are copy-paste ready)

Automated check:
```bash
# Verify examples/configs/ appears in README
grep -c "examples/configs/" README.md

# Verify Quick Start section mentions role-specific configs
grep -A 5 "### What's Next?" README.md | grep -c "minerva.config.yaml"

# Verify Configuration section has role-specific configs subsection
grep -A 20 "### Role-Specific Configs" README.md | grep -c "worker.config.yaml"
```

Expected: All checks return count >= 1
</verification>

<success_criteria>
The documentation gap is closed when:
1. Developer reading README.md Quick Start sees examples/configs/ reference
2. Developer reading README.md Configuration section finds all 3 role-specific configs documented
3. No search required to find role-specific configs from README
4. Key link "README.md -> examples/configs/*.yaml" is established
</success_criteria>

<output>
After completion, create `.planning/phases/15-documentation/15-GAP-SUMMARY.md`
</output>
