variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefix and tag for all resources"
  type        = string
  default     = "cv-future-predictor"
}

variable "allowed_ingress_cidr" {
  description = "Who may reach the public ALB, for example your IP as x.x.x.x/32"
  type        = string
}
