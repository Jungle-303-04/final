# console 정적 서빙 + same-origin API 프록시.
# dist/ 는 호스트에서 `VITE_API_MODE=real npm run build` 로 생성한다(멀티스테이지 불필요한 단순 경로).
# console frontend image.
# AWS CD builds this image directly from frontend/, so the Dockerfile owns the Vite build.
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
EXPOSE 8080
