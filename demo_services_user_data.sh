#!/bin/bash

# Install Docker
yum update -y
amazon-linux-extras install docker
service docker start
usermod -a -G docker ec2-user

# Install Docker-Compose
curl -L "https://github.com/docker/compose/releases/download/1.28.6/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod 0555 /usr/local/bin/docker-compose
export PATH=$PATH:/local/bin
echo 'export PATH=$PATH:/local/bin' >> /home/ec2-user/.bashrc

# Customizations :)
echo 'alias docc=docker-compose' >> /home/ec2-user/.bashrc

# Install Git & Clone Repo
yum install git -y
cd /home/ec2-user
git clone https://github.com/toblich/nosy-cat.git

# Start everything
chown -R ec2-user nosy-cat
cd nosy-cat/demo-services
export NC_HOST=nosy-cat.tk
docker-compose up -d
