# infrastructure

Terraform for the whole solution.

| Module | Creates |
|---|---|
| `network` | VPC, two public and two private subnets, internet gateway and route tables |
| `security` | Security groups for each hop |
| `endpoints` | S3 and DynamoDB gateway endpoints, Bedrock runtime interface endpoint |
| `load-balancing` | Internet-facing ALB, internal ALB, listeners and target groups |
| `compute` | Launch templates and auto scaling groups for the front end and back end |
| `storage` | Private S3 buckets for CVs (with CORS and lifecycle rules) and build artifacts |
| `database` | DynamoDB table for results |
| `iam` | Least-privilege instance roles |
| `dns` | Optional Route 53 records for your own domain |

Suggested build order: network, security, storage, database, iam, endpoints, load-balancing, compute, dns.

## Security group chain

| Resource | Inbound from |
|---|---|
| Public ALB | `allowed_ingress_cidr` |
| Front end | Public ALB |
| Internal ALB | Front end |
| Back end | Internal ALB |
| Bedrock endpoint | Back end, port 443 |
