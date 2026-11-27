# Wire the modules together. Add inputs as each module is written.

module "network" {
  source = "./modules/network"
}

module "security" {
  source = "./modules/security"
}

module "endpoints" {
  source = "./modules/endpoints"
}

module "load_balancing" {
  source = "./modules/load-balancing"
}

module "compute" {
  source = "./modules/compute"
}

module "storage" {
  source = "./modules/storage"
}

module "database" {
  source = "./modules/database"
}

module "iam" {
  source = "./modules/iam"
}

module "dns" {
  source = "./modules/dns"
}
