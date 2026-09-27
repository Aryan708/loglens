# LogLens: interview and resume guide

This file is for you, not for recruiters. **Before you put this project on your resume, make sure you can explain every file.** Interviewers will open your GitHub and ask you to walk through the code. The 7-day plan at the end gets you there.

---

## 1. Resume entry (add under PROJECTS)

**LogLens: Serverless Log Analyser** | React, AWS Lambda, Step Functions, DynamoDB, S3, SAM, Jest, Mocha | [GitHub] · [Live demo]

- Built a full-stack log analysis web app in **React** that parses multi-format logs, detects error spikes with z-score analysis and groups recurring errors into patterns, with an interactive SVG timeline and a filterable, paginated table.
- Designed a serverless AWS back end with an **API-first REST API** (API Gateway + **Lambda**): the browser uploads files directly to **S3** through presigned URLs, and an S3 event starts a **Step Functions** pipeline (parse → detect anomalies → save to **DynamoDB**) with retries and failure handling.
- Defined all infrastructure as code with **AWS SAM**. **GitHub Actions CI/CD** lints, tests (**Jest** + React Testing Library, **Mocha** + Chai, 60+ tests, ~90% coverage), builds and deploys.
- Applied the **Strategy** and **Repository** design patterns and built to **WCAG** accessibility practices (keyboard navigation, ARIA, screen-reader announcements).

Once you've deployed, update the numbers (test count, coverage) to match what CI shows.

## 2. The 60-second pitch

> "LogLens is a log analyser I built to practise full-stack and cloud development. You upload a log file and it shows you where errors spiked, which errors keep recurring, and a searchable table of every entry.
>
> The front end is React. The back end is serverless on AWS. The browser asks the API for a presigned S3 URL and uploads the file straight to S3, so big files never go through Lambda. S3 fires an event that starts a Step Functions workflow: one Lambda parses the file, another detects anomalies, and the result is written to DynamoDB. The front end polls the API until the job is done.
>
> The parsing code is shared, so the same logic runs in the browser for the free demo and in Lambda for cloud mode. Everything is defined in a SAM template and deployed through GitHub Actions, with Jest tests on the front end and Mocha on the back end."

## 3. Questions you should expect, with answers

**Why upload to S3 directly instead of sending the file to your API?**
API Gateway has a 10 MB payload limit and Lambda has a 6 MB synchronous limit. With a presigned URL, the file goes straight to S3, and my Lambda only creates a job record and signs a URL. That's cheaper, faster and scales without extra work. The URL expires after 5 minutes and is scoped to one key.

**Why Step Functions and not one Lambda?**
Separation of concerns. Each step does one thing and can be tested on its own. Retries with backoff are configured in the workflow rather than written by hand. If a step fails, the `Catch` routes to `MarkFailed`, so the job is never stuck. The console shows each execution visually, which makes debugging easy. Adding a step, such as indexing into OpenSearch, is a small change.

**Why store results in S3 instead of DynamoDB?**
DynamoDB items max out at 400 KB and Step Functions payloads at 256 KB. A parsed log can be many MB. So the full entries go to S3, and DynamoDB holds only the job status and a small summary.

**Explain your DynamoDB design.**
One table. The partition key is `JOB#<id>` and the sort key is `META`, so getting a job is a single `GetItem`. To list recent jobs without a scan, a GSI called `ByEntity` uses `entity = "JOB"` as its partition key and `createdAt` as its sort key, and I query it with `ScanIndexForward: false` for newest first. TTL on `expiresAt` deletes old jobs automatically. *(Honest caveat if asked: all jobs sharing one GSI partition could become a hot partition at very high scale. In that case I'd shard by date or by user ID.)*

**How does anomaly detection work?**
I bucket entries by time. The bucket size is chosen automatically, giving about 30 buckets. I count errors per bucket, compute the mean and standard deviation, and flag buckets whose z-score is 2 or more and that have at least 3 errors. The minimum stops a jump from 0 to 1 error counting as a spike. It's simple and explainable. A next step would be a rolling baseline to handle daily traffic cycles.

**Where are design patterns used?**
The *Strategy pattern* is in `parser.js`: each log format is an object with a `parse` method, and the parser tries each in turn. The *Repository pattern* is in `jobsRepository.js`: handlers call `getJob(id)` and never touch DynamoDB keys. I also use a *custom hook* (`useLogAnalysis`) to separate state logic from UI, and *pure functions* for all the analytics, which makes them easy to test.

**How did you test it?**
Front end: Jest with React Testing Library. I test behaviour the way a user sees it, finding elements by role and label and clicking with `user-event`, not implementation details. Back end: Mocha and Chai. `aws-sdk-client-mock` fakes DynamoDB and S3, so tests run offline in milliseconds. CI runs everything on every pull request, and a coverage threshold fails the build if coverage drops.

**How did you make it accessible?**
Semantic HTML (`main`, `header`, `nav`, table `caption`, `th scope`). Every control has a label. The chart bars are focusable, work with Enter or Space, and have descriptive `aria-label`s. Status changes are announced with `aria-live`. Sorting is exposed with `aria-sort`. Focus moves to the results when they load. Error rows use a badge as well as colour. ESLint's `jsx-a11y` plugin runs in CI.

**How would you handle a 1 GB log file?**
Today Lambda reads the whole file into memory, which is capped at 200k entries. For huge files I'd stream the S3 object line by line, or split the file with a Step Functions *Distributed Map* to process chunks in parallel, then merge the aggregates.

**Security?**
The bucket is private and encrypted, with public access blocked. IAM follows least privilege through SAM policy templates. CORS is restricted to the front end's origin. I validate file type and size, and sanitise file names so a path like `../../` can't escape the key prefix. Users get generic 500 errors, with details only in CloudWatch. GitHub deploys use OIDC, so no AWS keys are stored in GitHub.

**What would you improve?**
Cognito authentication so users only see their own jobs, OpenSearch for search across files, a Web Worker so large files don't freeze the browser tab, TypeScript, and WebSockets or EventBridge Pipes to push status instead of polling.

## 4. Seven-day plan to own this project

| Day | Do this | Goal: be able to explain |
|---|---|---|
| 1 | Run it locally. Read `backend/src/core/parser.js` and `analyzer.js`. Change a regex and watch a test fail. | How parsing, bucketing, z-scores and templates work |
| 2 | Read `frontend/src/App.jsx`, `Dashboard.jsx` and `useLogAnalysis.js`. Add a small feature, such as a "Copy line" button. | React state, props, hooks, `useMemo`, `useDeferredValue` |
| 3 | Read `TimelineChart.jsx`, `LogTable.jsx` and `FilterBar.jsx`. Tab through the app with only the keyboard. | SVG rendering, accessibility attributes, controlled inputs |
| 4 | Read all the tests. Write two new ones yourself: one Jest, one Mocha. | Testing Library queries, mocking, what makes a good test |
| 5 | Create an AWS free-tier account and set a billing alarm. Run `sam build && sam deploy --guided`. Upload a file in cloud mode. Watch the Step Functions execution in the console. | Every resource in `template.yaml` and why it exists |
| 6 | Push to GitHub and enable Pages. Watch CI run. Break a test on purpose and see CI go red. | CI/CD, what each workflow job does |
| 7 | Practise the pitch out loud. Answer the questions above without notes. Then run `sam delete` if you don't want to keep paying for idle resources (it should be about ₹0, but check). | Confident 10-minute walkthrough |

## 5. Pushing to GitHub

```bash
cd loglens
git init
git add .
git commit -m "LogLens: log analyser with React front end and serverless AWS back end"
git branch -M main
git remote add origin https://github.com/Aryan708/loglens.git
git push -u origin main
```

Then enable **Settings → Pages → Source: GitHub Actions**. Add the live demo link to the top of the README, to your resume and to your LinkedIn featured section.

**Tip:** don't push everything in one commit and stop. As you work through the 7-day plan, commit your own changes (new tests, the Copy button, fixes). A history of real commits over several days looks much better than a single upload.
