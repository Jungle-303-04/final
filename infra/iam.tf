# GitHub Actions OIDC — aws-cd.yml 의 AWS_ROLE_ARN 으로 쓰는 배포 role.
# 장수 액세스 키 없이, 이 저장소의 워크플로만 임시 자격증명을 받는다.
data "aws_caller_identity" "current" {}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

data "aws_iam_policy_document" "github_actions_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # 이 저장소의 워크플로만 신뢰 — 브랜치 제한을 더 걸려면 ref 조건 추가
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:*"]
    }
  }
}

resource "aws_iam_role" "github_actions_deploy" {
  name               = "${var.project_slug}-github-actions-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_actions_assume.json
}

# 배포에 필요한 권한 — EKS 접근, ECR push, (옵션) Route53.
# 실습 단순화를 위해 관리형 정책 조합. 프로덕션은 최소권한 커스텀 정책으로 좁힐 것.
resource "aws_iam_role_policy" "github_actions_deploy" {
  name = "deploy"
  role = aws_iam_role.github_actions_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "EksAccess"
        Effect   = "Allow"
        Action   = ["eks:DescribeCluster", "eks:ListClusters", "eks:TagResource", "eks:AccessKubernetesApi"]
        Resource = "*"
      },
      {
        Sid    = "EcrPush"
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken", "ecr:BatchCheckLayerAvailability", "ecr:CompleteLayerUpload",
          "ecr:CreateRepository", "ecr:DescribeRepositories", "ecr:InitiateLayerUpload",
          "ecr:PutImage", "ecr:UploadLayerPart", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"
        ]
        Resource = "*"
      },
      {
        Sid      = "Ec2ReadForNodeTags"
        Effect   = "Allow"
        Action   = ["ec2:DescribeInstances", "ec2:CreateTags"]
        Resource = "*"
      },
      {
        Sid      = "ElbReadForHealthWait"
        Effect   = "Allow"
        Action   = ["elasticloadbalancing:Describe*"]
        Resource = "*"
      }
    ]
  })
}
