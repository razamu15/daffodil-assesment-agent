# Take-home: an assistant for paying the people who help at home

## The problem

Jordan and Sam Rivera have two kids, a dog, and three people who help them run the house:
a babysitter, a cleaner, and a dog walker. Every deal with these helpers was made by text
or in passing. "$22/hr, more after 10pm." A screenshot of "ok, $140 per visit." Something
Jordan half-remembers agreeing to in the driveway.

At the start of each month the bills arrive by text, by email, and as screenshots. Jordan
wants to know one thing: **is this what we agreed to?** Then Jordan wants to pay.

Build Jordan an assistant for this.

## What we're asking for

A working product, not a prototype of one. Jordan should be able to:

- give it what Jordan has (typed notes, pasted messages, screenshots),
- end up with a clear record of what was agreed with each helper,
- check each bill against those agreements and understand the result, and
- approve a bill for payment.

What screens, flows and features that takes is your call. Deciding what the product needs
is part of the exercise.

## Hard requirements

1. **Amazon Bedrock AgentCore Memory** for the assistant's memory, both within a
   conversation and across conversations. Where the agent itself runs is up to you.
2. **A Claude model on Amazon Bedrock.** Name the model ID and region in your README.
3. **A UI.** We'll judge this as a product.
4. **Infrastructure as code with AWS CDK** (TypeScript or Python). We will clone your repo
   and deploy it to *our own* AWS account. A single documented command deploys it, one
   tears it down, and nothing is hardcoded to your account or region. After deploying, the
   stack should print what we need to open the app.
5. **Nothing changes money or agreements without Jordan's say-so.** At a minimum, saving or
   changing a helper's terms and approving a bill must each require Jordan's explicit
   confirmation. Once a bill is approved, it can't be edited.
6. **Not open to the internet.** The deployed app must not be usable by someone who simply
   finds the URL. How you protect it is up to you; keep it simple.

## Out of scope

Real payments or bank connections, notifications, mobile apps, multiple households or
users, scaling. Bills don't need to arrive by email or SMS. Jordan pastes or uploads them.

There are no stretch goals. If you have time left, spend it making what you built
trustworthy.

## What we give you

`starter-pack/`: one household's real-world mess. Three helpers, their agreements in
whatever form they exist, and September's bills. The data is realistic: messy, sometimes
contradictory, sometimes wrong.

## What to send back

A link to a GitHub repo containing:

- **The code and CDK app.**
- **README.md:** prerequisites (including which Bedrock model must be enabled in which
  region), the deploy command, the teardown command, and how to log in.
- **DESIGN.md, one page at most:** your key decisions, what the assistant remembers vs. what
  the system records and why, how it behaves when the inputs disagree, known failure modes,
  and what you deliberately left out.
- *Optional:* a screen recording of up to 3 minutes walking through the starter pack.

## How we'll evaluate

1. **Product:** would Jordan trust this with the family's money?
2. **Correctness:** on the starter pack and on inputs you haven't seen.
3. **Agent design:** memory, tools, and where the confirmations sit.
4. **Deployability:** clone, deploy, and it works for us on the first try.
5. **Judgment:** what you built, what you cut, and why.

After you submit, we'll deploy your repo and meet for about 45 minutes. We'll try it with new
inputs, ask you to make one small change live, and talk through your design.

## Logistics

- Plan on about two days of work. We don't expect more, and more won't score higher.
- Use any AI tools you like.
- We'll reimburse your AWS costs for building and testing this, up to **$[CAP]**. Keep the
  receipt, and tear the stack down when you're done.
- We won't answer product questions. When something is ambiguous, make a reasonable call
  and note it in DESIGN.md.
