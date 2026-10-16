terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
  }

  # Uncomment and configure for team use (remote, locked state).
  # backend "s3" {
  #   bucket         = "my-org-terraform-state"
  #   key            = "mds/standalone/terraform.tfstate"
  #   region         = "eu-west-1"
  #   dynamodb_table = "terraform-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "openg2p-mds"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
