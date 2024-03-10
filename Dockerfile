FROM node:20-bookworm-slim as builder
WORKDIR /app
COPY . .
RUN npm run build

FROM gcr.io/distroless/nodejs20-debian12
MAINTAINER "Brett Logan"
COPY --from=builder /app/dist /app/dist
CMD ["/app/dist/index.js"]
