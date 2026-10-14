# Saad: AWS Setup, From Zero to the Start Line

Goal: after this page you can run `cdk deploy` in your own AWS account, and the agent can call Claude on Bedrock.

---

## Do I need the AWS CLI?

**Not strictly, but install it.**

| What | Needs the CLI? |
|---|---|
| `cdk deploy` and `cdk destroy` | **No.** CDK only needs AWS *credentials*. The CLI is just the easiest way to set them up |
| Checking who you're logged in as | Yes (`aws sts get-caller-identity`) |
| Smoke-testing Bedrock before writing code | Yes (`aws bedrock-runtime converse`) |
| Reading stack outputs, tailing logs | Convenient |

**Analogy:** CDK is the app. Credentials are the login. The CLI is the tool you use to log in and poke around.

---

## What you do NOT need

- Docker (we bundle Lambdas with esbuild)
- A domain name
- A VPC or any networking setup
- Global installs of CDK (we use `npx cdk`)

---

## Steps

### 1. An AWS account and a non-root identity

You need an AWS account. **Don't use the root user for work.** Two ways to get credentials:

| Option | Effort | Notes |
|---|---|---|
| **A. IAM user + access keys** | Simplest | Create an IAM user with `AdministratorAccess`, then create an access key. Long-lived keys, so delete them when done |
| **B. IAM Identity Center (SSO)** | More setup | Short-lived credentials. Better practice |

For a take-home, **A** is fine. Delete the key afterward.

### 2. Install the AWS CLI v2 (macOS)

```bash
brew install awscli
aws --version        # should say aws-cli/2.x
```

No Homebrew? Use the official installer from the AWS docs.

### 3. Give the CLI your credentials

**Option A (access keys):**
```bash
aws configure
# AWS Access Key ID:      <paste>
# AWS Secret Access Key:  <paste>
# Default region name:    <see step 5>
# Default output format:  json
```

**Option B (SSO):**
```bash
aws configure sso
aws sso login
```

### 4. Verify who you are

```bash
aws sts get-caller-identity
```

You should see your account ID and user. If this works, CDK will work.

### 5. Pick a region

The region must support **both**:
- the Claude model you'll use on Bedrock, and
- Bedrock AgentCore (Memory).

Both services are not in every region. **[VERIFY]** in the AWS docs ("Bedrock supported regions" and "AgentCore supported regions"). If in doubt, start with `us-east-1` or `us-west-2`, which usually get new services first.

```bash
aws configure set region us-east-1     # example only, confirm first
aws configure get region
```

### 6. Install Node and npm

```bash
node -v      # use a current LTS (20 or 22)
npm -v
```

```bash
brew install node@22     # if missing
```

### 7. Make sure the Claude model is available

1. AWS Console → **Amazon Bedrock** → model catalog, in your chosen region.
2. Find the Claude model we'll use. For Anthropic models, AWS may ask for a one-time use-case form. **[VERIFY]** current flow.
3. Note the exact **model ID** or **inference profile ID**. Profile IDs have a region prefix (like `us.`).

**Smoke test from your terminal:**
```bash
aws bedrock-runtime converse \
  --model-id <MODEL_ID_OR_INFERENCE_PROFILE_ID> \
  --messages '[{"role":"user","content":[{"text":"Say hi in five words."}]}]' \
  --region <REGION>
```

If you get text back, the model is ready. If you get `AccessDeniedException`, the model isn't enabled for your account in that region, or the ID is wrong.

### 8. Bootstrap CDK (once per account and region)

Run this **inside the project** once it exists:

```bash
npx cdk bootstrap
```

It uses your active credentials and region. Safe to re-run.

### 9. Add a billing guardrail

- Console → **Billing** → **Budgets** → create a monthly cost budget with an email alert (for example $20).
- The brief reimburses AWS costs up to a cap, so **keep receipts**.
- Always run teardown when you pause for a while.

---

## Start-line checklist

```
[ ] aws --version works (v2)
[ ] aws sts get-caller-identity shows my account
[ ] Region chosen, and Bedrock Claude + AgentCore both available there
[ ] aws bedrock-runtime converse returns text
[ ] node -v is 20 or 22
[ ] Budget alert created
[ ] (inside the project) npx cdk bootstrap succeeded
```

When all boxes are checked, you're at the start line. Go to Doc 4 (`build-plan_latest.md`).

---

## Handy later

```bash
# use a named profile for one command
AWS_PROFILE=myprofile npx cdk deploy

# tail the agent's logs
aws logs tail /aws/lambda/<function-name> --follow

# list stacks you've deployed
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE
```
