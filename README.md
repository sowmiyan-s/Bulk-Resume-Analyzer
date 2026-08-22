# Resume Radiance

i need a bulk ai resume analyzer that analyzes n number of resumes when uploaded in a zip file it must extract each resume analyze it and provide ATS score along with suggestions and feedbacks based on the resume pointing where its negative and wrong and should provide a proper or correctly formatted content for the resume it must also have an option where if a JD is given it must compare with the JD also and must provide the result properly make sure it accepts any kind of documentary files like jpg,jpeg,pdf,word etc

i want to build this using the llm code that il attach below and it must have a time delay kind of option for each resume such that keep a feature through which we can adjust or customize the timings for each analysis

from openai import OpenAI

client = OpenAI(

base_url = "https://integrate.api.nvidia.com/v1",

api_key = "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"

)

completion = client.chat.completions.create(

model="nvidia/nemotron-3.5-lightning-30b-a3b",

messages=[{"role":"user","content":"Write a limerick about the wonders of GPU computing."}],

temperature=1,

top_p=0.95,

max_tokens=16384,

extra_body={"chat_template_kwargs":{"enable_thinking":True},"reasoning_budget":16384},

stream=True

)

for chunk in completion:

if not chunk.choices:

    continue

reasoning = getattr(chunk.choices[0].delta, "reasoning_content", None)

if reasoning:

    print(reasoning, end="")

if chunk.choices[0].delta.content is not None:

    print(chunk.choices[0].delta.content, end="")

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6d5e2c33-de46-45f9-ad10-0c6c73d3e8c3).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
