# EKS 클러스터 3개 — management-server / game-server / demo-server.
# 공식 모듈 사용: https://github.com/terraform-aws-modules/terraform-aws-eks
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.31"

  for_each = var.clusters

  cluster_name    = each.value.name
  cluster_version = var.kubernetes_version

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  cluster_endpoint_private_access        = true
  cluster_endpoint_public_access         = true
  cluster_endpoint_public_access_cidrs   = var.eks_public_access_cidrs
  cluster_enabled_log_types              = ["api", "audit", "authenticator", "controllerManager", "scheduler"]
  cloudwatch_log_group_retention_in_days = var.cluster_log_retention_days

  # 생성한 IAM 주체(팀원·CI)가 곧바로 kubectl 을 쓸 수 있게 admin 권한 부여
  enable_cluster_creator_admin_permissions = true

  cluster_addons = {
    coredns                = {}
    kube-proxy             = {}
    vpc-cni                = {}
    aws-ebs-csi-driver     = {} # storage.yaml 의 gp3 PVC 용
    eks-pod-identity-agent = {}
  }

  eks_managed_node_groups = {
    default = {
      instance_types = each.value.instance_types
      capacity_type  = each.value.capacity_type
      min_size       = each.value.min_size
      max_size       = each.value.max_size
      desired_size   = each.value.desired_size

      # EBS CSI 가 노드에서 볼륨을 붙일 수 있게
      iam_role_additional_policies = {
        ebs_csi = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
      }

      labels = {
        role = each.value.role
      }

      tags = {
        DisplayName = each.value.display_name
        Role        = each.value.role
      }
    }
  }

  tags = {
    DisplayName = each.value.display_name
    Role        = each.value.role
  }
}
