# Source packages

| Folder | What it is |
|---|---|
| [frontend](./frontend/README.md) | Web server that calls the back end through the internal ALB |
| [backend](./backend/README.md) | API for uploads, predictions and results |
| [data-models](./data-models/README.md) | Types shared by both apps |
| [infrastructure](./infrastructure/README.md) | Terraform code |

`frontend`, `backend` and `data-models` form one npm workspace:

```bash
cd source
npm install
npm run build
npm test
```

Commit the generated `package-lock.json`.
