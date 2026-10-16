/**
 * One URL for everything: CloudFront serves the built React app from a private
 * bucket and proxies /api/* to the HTTP API, so the browser never needs CORS.
 * The UI uses hash routing, so no SPA fallback is configured (it would turn API
 * 404s into index.html).
 */
import { Fn, RemovalPolicy, Stack } from "aws-cdk-lib";
import type { HttpApi } from "aws-cdk-lib/aws-apigatewayv2";
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  OriginProtocolPolicy,
  OriginRequestPolicy,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { HttpOrigin, S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { BlockPublicAccess, Bucket, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { Construct } from "constructs";

export type WebProps = {
  httpApi: HttpApi;
  /** Directory holding the built UI (index.html and assets). */
  webDist: string;
};

export class Web extends Construct {
  readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: WebProps) {
    super(scope, id);

    const siteBucket = new Bucket(this, "Site", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const apiDomain = `${props.httpApi.apiId}.execute-api.${Stack.of(this).region}.${Fn.ref("AWS::URLSuffix")}`;

    this.distribution = new Distribution(this, "Distribution", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        "/api/*": {
          origin: new HttpOrigin(apiDomain, { protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY }),
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          // Forwarding Host to API Gateway makes it 403.
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });

    new BucketDeployment(this, "Deploy", {
      sources: [Source.asset(props.webDist)],
      destinationBucket: siteBucket,
      distribution: this.distribution,
      distributionPaths: ["/*"],
      logGroup: new LogGroup(this, "DeployLogs", { retention: RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.DESTROY }),
    });
  }
}
