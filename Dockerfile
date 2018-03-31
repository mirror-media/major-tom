FROM node:9-alpine

RUN groupadd user && useradd --create-home --home-dir /home/user -g user user

COPY . .
RUN apk update \
    && apk add curl \
    && curl -LO https://storage.googleapis.com/kubernetes-release/release/$(curl -s https://storage.googleapis.com/kubernetes-release/release/stable.txt)/bin/linux/amd64/kubectl \
    && chmod +x ./kubectl \
    && sudo mv ./kubectl /usr/local/bin/kubectl

CMD ["./bin/hubot","--adapter","slack"]
