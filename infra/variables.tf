# 이 파일은 신규 blue/green 기반의 canonical 설계값이다.
# 기존 eksctl 리소스는 Terraform state에 없으므로 infra/README.md의 승인 게이트 전에는 apply하지 않는다.
variable "project_slug" {
  description = "리소스 이름 접두어"
  type        = string
  default     = "kubernetes-ops"
}

variable "aws_region" {
  description = "AWS 리전"
  type        = string
  default     = "ap-northeast-2"
}

variable "vpc_cidr" {
  description = "공용 VPC CIDR"
  type        = string
  default     = "10.80.0.0/16"
}

variable "kubernetes_version" {
  description = "EKS Kubernetes 버전"
  type        = string
  default     = "1.34"
}

variable "eks_public_access_cidrs" {
  description = "EKS public endpoint 허용 CIDR. GitHub-hosted runner를 쓰면 배포 직전 공식 Actions CIDR을 명시한다."
  type        = set(string)

  validation {
    condition = (
      length(var.eks_public_access_cidrs) > 0
      && !contains(var.eks_public_access_cidrs, "0.0.0.0/0")
      && !contains(var.eks_public_access_cidrs, "::/0")
      && alltrue([
        for cidr in var.eks_public_access_cidrs : can(cidrnetmask(cidr))
      ])
    )
    error_message = "EKS public endpoint CIDR은 비어 있을 수 없고 전체 인터넷 CIDR을 허용할 수 없습니다."
  }
}

variable "cluster_log_retention_days" {
  description = "EKS control-plane CloudWatch 로그 보존 일수"
  type        = number
  default     = 30

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365], var.cluster_log_retention_days)
    error_message = "CloudWatch가 지원하는 로그 보존 일수를 사용하세요."
  }
}

# 클러스터 3개 — management(허브) + game/demo target(스포크).
# key는 Terraform 주소 안정성용이고 실제 EKS 이름은 name 필드다.
variable "clusters" {
  description = "생성할 EKS 클러스터 정의"
  type = map(object({
    name           = string
    display_name   = string
    role           = string
    capacity_type  = string
    instance_types = list(string)
    min_size       = number
    max_size       = number
    desired_size   = number
  }))
  default = {
    management = {
      name           = "management-server"
      display_name   = "메니지먼트"
      role           = "management"
      capacity_type  = "ON_DEMAND"
      instance_types = ["r6i.xlarge"]
      min_size       = 2
      max_size       = 2
      desired_size   = 2
    }
    game_server = {
      name           = "game-server"
      display_name   = "게임 서버"
      role           = "target"
      capacity_type  = "SPOT"
      instance_types = ["t3.large", "t3a.large", "m5.large"]
      min_size       = 1
      max_size       = 3
      desired_size   = 3
    }
    demo_server = {
      name           = "demo-server"
      display_name   = "데모 서버"
      role           = "target"
      capacity_type  = "SPOT"
      instance_types = ["t3.large", "t3a.large", "m5.large"]
      min_size       = 1
      max_size       = 2
      desired_size   = 2
    }
  }

  validation {
    condition = alltrue([
      for cluster in values(var.clusters) :
      can(regex("^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$", cluster.name))
      && contains(["management", "target"], cluster.role)
      && contains(["ON_DEMAND", "SPOT"], cluster.capacity_type)
      && length(cluster.instance_types) > 0
      && cluster.min_size >= 1
      && cluster.min_size <= cluster.desired_size
      && cluster.desired_size <= cluster.max_size
    ])
    error_message = "클러스터 이름, 역할, capacity, instance type, scaling 범위를 확인하세요."
  }
}

variable "ecr_repositories" {
  description = "ECR 저장소 이름 목록 (project_slug 접두어 없이)"
  type        = list(string)
  default     = ["service", "console"]
}
