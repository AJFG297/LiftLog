# Contributing to LiftLog

This repository is an independently maintained fork of [LiamMorrow/LiftLog](https://github.com/LiamMorrow/LiftLog).
Work happens here and is not submitted back upstream, so upstream's contribution process (issues and
discussions on the upstream repo, PR size limits) does not apply.

## Code Style & Guidelines

- Use [oxfmt](https://oxc.rs/docs/guide/usage/formatter.html) and [oxlint](https://oxc.rs/docs/guide/usage/linter.html) for formatting and linting TypeScript.
- For C# code, use [CSharpier](https://csharpier.com/) for automatic code formatting. Run `dotnet csharpier .` in backend folders before committing.
- Write clear, descriptive commit messages.
- Follow the existing code structure and naming conventions.
- Add comments where necessary, especially for complex logic.

## Issues

Issues and specs are tracked in Linear (project LiftLog), not GitHub Issues. See
[docs/agents/issue-tracker.md](docs/agents/issue-tracker.md) for the workflow.

## Making Changes

1. **Create a new branch** named after the Linear issue:
   ```sh
   git checkout -b PM-123-short-slug
   ```
2. **Make your changes** and ensure all tests pass.
3. **Run tests**:
   - Frontend:
     ```sh
     npm test
     ```
   - Backend:
     ```sh
     dotnet test
     ```
4. **Push your branch** and open a Pull Request (PR) against `main`, with the issue ID (e.g. `PM-123`) in the title so Linear links it.

## Pull Request Checklist

- [ ] The code compiles and passes all tests.
- [ ] Linting and formatting checks pass.
- [ ] The PR description clearly explains the changes.
- [ ] Related documentation is updated.
- [ ] No sensitive information is included.

## License

LiftLog is licensed under the [AGPL v3 license](LICENSE), and so are contributions to this fork.
