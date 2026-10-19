variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "eu-west-1"
}

variable "environment" {
  description = "Environment name (e.g. staging, production). Used in resource names."
  type        = string
  default     = "staging"
}

variable "name_prefix" {
  description = "Prefix for all resource names."
  type        = string
  default     = "mds"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.40.0.0/16"
}

variable "public_subnet_cidr" {
  description = "CIDR block for the public subnet hosting the cluster nodes."
  type        = string
  default     = "10.40.1.0/24"
}

variable "admin_cidrs" {
  description = "CIDRs allowed to reach SSH (22) and the Kubernetes API (6443). Restrict to your office/VPN."
  type        = list(string)
}

variable "public_ingress_cidrs" {
  description = "CIDRs allowed to reach HTTP/HTTPS (80/443) on the ingress. Standalone mode has NO login, so restrict this unless you add basic auth."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "ssh_public_key_path" {
  description = "Path to the SSH public key to install on the nodes."
  type        = string
  default     = "~/.ssh/mds.pub"
}

variable "ssh_private_key_path" {
  description = "Path to the matching SSH private key (only written into the generated Ansible inventory)."
  type        = string
  default     = "~/.ssh/mds"
}

variable "server_instance_type" {
  description = "Instance type for the k3s server (control-plane) node."
  type        = string
  default     = "t3.large"
}

variable "agent_instance_type" {
  description = "Instance type for the k3s agent (worker) nodes."
  type        = string
  default     = "t3.large"
}

variable "agent_count" {
  description = "Number of k3s agent (worker) nodes. 0 = single-node cluster."
  type        = number
  default     = 1
}

variable "root_volume_size_gb" {
  description = "Root EBS volume size for each node (holds container images and local-path PVs)."
  type        = number
  default     = 80
}
