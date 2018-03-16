FROM node

RUN groupadd user && useradd --create-home --home-dir /home/user -g user user

COPY . .

CMD ["./bin/hubot","--adapter","slack"]
