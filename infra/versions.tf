# Terraform 1단계 — 기반 인프라(VPC·EKS·ECR·IAM)만 코드화한다.
# 앱 배포(이미지 빌드, kubectl/helm)는 여기서 하지 않는다 — scripts/aws-up.sh 와 CD 파이프라인 담당.
terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }

  # 원격 state 백엔드 — 팀 공유·잠금용. 최초 1회 부트스트랩 후 주석 해제:
  #   aws s3 mb s3://<project>-terraform-state --region ap-northeast-2
  #   aws dynamodb create-table --region ap-northeast-2 --table-name <project>-terraform-lock \
  #     --attribute-definitions AttributeName=LockID,AttributeType=S \
  #     --key-schema AttributeName=LockID,KeyType=HASH --billing-mode PAY_PER_REQUEST
  #
  # backend "s3" {
  #   bucket         = "kubernetes-ops-terraform-state"
  #   key            = "infra/terraform.tfstate"
  #   region         = "ap-northeast-2"
  #   dynamodb_table = "kubernetes-ops-terraform-lock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = var.project_slug
      ManagedBy = "terraform"
    }
  }
}
