FROM node:22-bookworm-slim
RUN npm install --global pnpm@11.25.0
WORKDIR /app
RUN chown node:node /app
USER node
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node packages/shared/package.json ./packages/shared/
COPY --chown=node:node apps/api/package.json ./apps/api/
COPY --chown=node:node apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile
COPY --chown=node:node . .
RUN pnpm build
ENV HOST=0.0.0.0 PORT=3000 WEB_DIST_DIR=/app/apps/web/dist
EXPOSE 3000
ENTRYPOINT ["/bin/sh", "/app/infra/docker/entrypoint.sh"]
CMD ["node", "apps/api/dist/index.js"]
