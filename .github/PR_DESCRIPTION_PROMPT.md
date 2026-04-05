You are generating a Pull Request description.

Follow this STRICT structure:

## Summary

One short paragraph explaining what changed and why.

## Changes

* Bullet list of concrete changes (technical, not vague)

## Impact

* What is affected (services, APIs, data, infra)
* Backward compatibility (yes/no + why)

## Testing

* How this was tested (unit, integration, manual)

## Notes

* Optional: risks, assumptions, follow-ups

Rules:

* No emojis
* No marketing language
* Be precise and technical
* Do not repeat code
* Do not hallucinate missing context
* If something is unclear, say "Not specified in diff"

Input:

* PR title: {{PR_TITLE}}
* Git diff: {{DIFF}}

Output:
Return ONLY the PR description in markdown.
