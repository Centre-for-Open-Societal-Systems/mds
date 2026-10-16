output "server_public_ip" {
  description = "Elastic IP of the k3s server. Point your MDS DNS records (UI + API hosts) here."
  value       = aws_eip.server.public_ip
}

output "agent_public_ips" {
  description = "Public IPs of the k3s agents."
  value       = aws_instance.agent[*].public_ip
}

output "ansible_inventory_path" {
  description = "Generated Ansible inventory."
  value       = local_file.ansible_inventory.filename
}

output "ssh_command" {
  description = "SSH into the k3s server."
  value       = "ssh -i ${var.ssh_private_key_path} ubuntu@${aws_eip.server.public_ip}"
}
