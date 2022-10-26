resource "aws_iam_role" "basicExecutionRole" {
  name = "lambdaExecutionRole"

  assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Effect": "Allow",
      "Sid": ""
    }
  ]
}
EOF

}

resource "aws_iam_role" "pollySynthesizeSpeechRole" {
  name = "lambdaSynthesizeSpeechRole"

  assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Effect": "Allow",
      "Sid": ""
    }
  ]
}
EOF

}

resource "aws_iam_role" "exportRole" {
  name = "lambdaExportRole"

  assume_role_policy = jsonencode({
    Version: "2012-10-17"
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "sts:AssumeRole"
        ]
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Sid = ""
      }
    ]
  })

  managed_policy_arns = [
     "arn:aws:iam::aws:policy/AmazonS3FullAccess"
  ]
}

resource "aws_iam_role" "exportRoleInvokable" {
  name = "lambdaExportRoleInvokable"

  assume_role_policy = jsonencode({
    Version: "2012-10-17"
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "sts:AssumeRole"
        ]
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Sid = ""
      }
    ]
  })

  managed_policy_arns = [
     "arn:aws:iam::aws:policy/AmazonS3FullAccess"
  ]
}

resource "aws_iam_role_policy" "exportInvokeRolePolicy" {
  name        = "exportInvokeRolePolicy"
  role        = aws_iam_role.exportRole.id

  policy = <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "Stmt1464440182000",
            "Effect": "Allow",
            "Action": [
                "dynamodb:Scan",
                "dynamodb:Query",
                "dynamodb:PutItem",
                "lambda:InvokeAsync",
                "lambda:InvokeFunction",
                "s3:PutObject"
            ],
            "Resource": [
                "${aws_dynamodb_table.park_dup_table.arn}",
                "${aws_lambda_function.exportAllInvokableLambda.arn}",
                "${aws_s3_bucket.bcgov-parks-dup-data.arn}/*"
            ]
        }
    ]
}
EOF
}

resource "aws_s3_bucket" "bcgov-parks-dup-data" {
  bucket = "${data.aws_ssm_parameter.s3_bucket_data.value}-${var.target_env}"
  acl    = "private"

  tags = {
    Name = data.aws_ssm_parameter.s3_bucket_data.value
  }
}

resource "aws_iam_role" "metricRole" {
  name = "lambdaMetricRole"

  assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Effect": "Allow",
      "Sid": ""
    }
  ]
}
EOF

}

resource "aws_iam_role" "readRole" {
  name = "lambdaReadRole"

  assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Effect": "Allow",
      "Sid": ""
    }
  ]
}
EOF

}

resource "aws_iam_role" "writeRole" {
  name = "lambdaWriteRole"

  assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Effect": "Allow",
      "Sid": ""
    }
  ]
}
EOF

}

resource "aws_iam_role" "deleteRole" {
  name = "lambdaDeleteRole"

  assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Effect": "Allow",
      "Sid": ""
    }
  ]
}
EOF

}

resource "aws_iam_role_policy" "park_reso_dynamodb" {
  name = "park_reso_dynamodb"
  role = aws_iam_role.readRole.id

  policy = <<-EOF
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
            "dynamodb:BatchGet*",
            "dynamodb:DescribeStream",
            "dynamodb:DescribeTable",
            "dynamodb:Get*",
            "dynamodb:Query",
            "dynamodb:Scan",
            "dynamodb:BatchWrite*",
            "dynamodb:CreateTable",
            "dynamodb:Delete*",
            "dynamodb:Update*",
            "dynamodb:PutItem"
        ],
        "Resource": "${aws_dynamodb_table.park_dup_table.arn}"
      },
      {
        "Effect": "Allow",
        "Action": [
            "dynamodb:Query",
            "dynamodb:Scan"
        ],
        "Resource": "${aws_dynamodb_table.park_dup_table.arn}/index/*"
      }
    ]
  }
  EOF
}

resource "aws_iam_role_policy" "park_reso_dynamodb_export" {
  name = "park_reso_dynamodb_export"
  role = aws_iam_role.exportRole.id

  policy = <<-EOF
  {
    "Version": "2012-10-17",
    "Statement": [
      {
          "Effect": "Allow",
          "Action": [
            "dynamodb:BatchGet*",
            "dynamodb:DescribeStream",
            "dynamodb:DescribeTable",
            "dynamodb:Get*",
            "dynamodb:Query",
            "dynamodb:Scan",
            "dynamodb:BatchWrite*",
            "dynamodb:CreateTable",
            "dynamodb:Delete*",
            "dynamodb:Update*",
            "dynamodb:PutItem"
          ],
          "Resource": "${aws_dynamodb_table.park_dup_table.arn}"
      },
      {
          "Effect": "Allow",
          "Action": [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents"
          ],
          "Resource": "arn:aws:logs:*:*:*"
      }
    ]
  }
  EOF
}

resource "aws_iam_role_policy" "exportAllPassRolePolicy" {
  name = "park_reso_dynamodb_export"
  role = aws_iam_role.exportRoleInvokable.id

  policy = <<-EOF
  {
    "Version": "2012-10-17",
    "Statement": [
      {
          "Effect": "Allow",
          "Action": [
            "dynamodb:BatchGet*",
            "dynamodb:DescribeStream",
            "dynamodb:DescribeTable",
            "dynamodb:Get*",
            "dynamodb:Query",
            "dynamodb:Scan",
            "dynamodb:BatchWrite*",
            "dynamodb:CreateTable",
            "dynamodb:Delete*",
            "dynamodb:Update*",
            "dynamodb:PutItem"
          ],
          "Resource": "${aws_dynamodb_table.park_dup_table.arn}"
      },
      {
          "Effect": "Allow",
          "Action": [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents"
          ],
          "Resource": "arn:aws:logs:*:*:*"
      }
    ]
  }
  EOF
}

resource "aws_iam_role_policy" "park_reso_dynamodb_metric" {
  name = "park_reso_dynamodb_metric"
  role = aws_iam_role.metricRole.id

  policy = <<-EOF
  {
    "Version": "2012-10-17",
    "Statement": [
      {
          "Effect": "Allow",
          "Action": [
              "dynamodb:BatchGet*",
              "dynamodb:DescribeStream",
              "dynamodb:DescribeTable",
              "dynamodb:Get*",
              "dynamodb:Query",
              "dynamodb:Scan"
          ],
          "Resource": "${aws_dynamodb_table.park_dup_table.arn}"
        }
    ]
  }
  EOF
}

resource "aws_iam_role_policy" "park_reso_pollySynthesizeSpeech" {
  name = "park_reso_dynamodb"
  role = aws_iam_role.pollySynthesizeSpeechRole.id

  policy = <<-EOF
  {
    "Version": "2012-10-17",
    "Statement": [
      {
          "Effect": "Allow",
          "Action": [
              "polly:SynthesizeSpeech"
          ],
          "Resource": ["*"]
        }
    ]
  }
  EOF
}

resource "aws_iam_role_policy" "dynamoDBWriteRole" {
  name = "park_reso_dynamodb"
  role = aws_iam_role.writeRole.id

  policy = <<-EOF
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
            "dynamodb:BatchGet*",
            "dynamodb:DescribeStream",
            "dynamodb:DescribeTable",
            "dynamodb:Get*",
            "dynamodb:Query",
            "dynamodb:Scan",
            "dynamodb:BatchWrite*",
            "dynamodb:CreateTable",
            "dynamodb:Delete*",
            "dynamodb:Update*",
            "dynamodb:PutItem",
            "dynamodb:ConditionCheckItem"
        ],
        "Resource": "${aws_dynamodb_table.park_dup_table.arn}"
      },
      {
        "Effect": "Allow",
        "Action": [
            "dynamodb:Query"
        ],
        "Resource": "${aws_dynamodb_table.park_dup_table.arn}/index/*"
      }
    ]
  }
  EOF
}

resource "aws_iam_role_policy" "dynamoDBDeleteRole" {
  name = "park_reso_dynamodb"
  role = aws_iam_role.deleteRole.id

  policy = <<-EOF
  {
    "Version": "2012-10-17",
    "Statement": [
      {
          "Effect": "Allow",
          "Action": [
              "dynamodb:Get*",
              "dynamodb:Query",
              "dynamodb:Scan",
              "dynamodb:Update*",
              "dynamodb:PutItem",
              "dynamodb:ConditionCheckItem"
          ],
          "Resource": "${aws_dynamodb_table.park_dup_table.arn}"
        }
    ]
  }
  EOF
}

resource "aws_iam_role" "warmUpRole" {
  name = "lambdaWarmUpRole"

  assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Effect": "Allow",
      "Sid": ""
    }
  ]
}
EOF

}
