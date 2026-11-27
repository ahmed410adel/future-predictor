# Contributing

1. Create a branch from `main`.
2. Make one focused change.
3. Run `./deployment/run-unit-tests.sh` and `terraform fmt -recursive source/infrastructure`.
4. Add a line to `CHANGELOG.md`.
5. Open a pull request using the template.

Never commit credentials, `.env` files, Terraform state or real CVs.
