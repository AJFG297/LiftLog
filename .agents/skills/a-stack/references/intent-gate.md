# Intent gate

Run this gate before selecting an implementation playbook.

## Classify uncertainty

- **Evidence gap.** The repository, history, running system, or an existing
  artifact can answer it. Investigate instead of asking the user.
- **Empirical fork.** A small throwaway experiment can compare the options.
  Route to Prototype, observe the result, and feed the decision back into intent.
- **Human decision.** The answer changes product policy, user experience,
  commercial meaning, risk acceptance, or personal preference. Grill it.
- **Delivery question.** Intent is settled but work decomposition is not. Choose
  direct or planned delivery.

## Grilling contract

Use an installed `grilling` skill when it matches this contract. Otherwise ask
the smallest current set of prerequisite-complete questions. Give a recommended
answer and its consequence for each. Keep repository-answerable questions out of
the interview.

Grilling may invoke Prototype when observation would turn a subjective question
into evidence. A prototype may return to grilling when the result exposes a real
product tradeoff.

## Pass condition

The gate passes when the task has enough of the following to avoid building the
wrong outcome:

- actor or affected system;
- observable result;
- acceptance evidence;
- material constraints;
- non-goals;
- decisions reserved for the human.

Scale the record to the task. One clear bug report may pass immediately. A new
multi-tenant workflow may need a spec.
