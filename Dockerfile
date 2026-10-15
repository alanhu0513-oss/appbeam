# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim

# morluto/rea requires Node >= 22.19 — keep the image aligned with engines.
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true

RUN corepack enable

WORKDIR /app

# Resolve workspace manifests first so dependency layers stay cacheable.
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/dashboard/package.json apps/dashboard/
COPY apps/simulator-template/package.json apps/simulator-template/
COPY packages/pipeline/package.json packages/pipeline/

RUN pnpm config set store-dir /pnpm/store
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --prefer-offline

COPY . .

# The pipeline CLI entrypoint runs from dist/ — build it for `compose run pipeline`.
RUN pnpm --filter @appbeam/pipeline build

ENV PIPELINE_MODE=auto
EXPOSE 3000

CMD ["pnpm", "dev"]
