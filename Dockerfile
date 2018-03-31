FROM node:9-alpine

# RUN groupadd user && useradd --create-home --home-dir /home/user -g user user
ENV PATH="$PATH:/usr/local/gcloud/google-cloud-sdk/bin"

COPY . .
RUN apk update \
    && apk add curl python\
    && curl -LO https://storage.googleapis.com/kubernetes-release/release/$(curl -s https://storage.googleapis.com/kubernetes-release/release/stable.txt)/bin/linux/amd64/kubectl \
    && chmod +x ./kubectl \
    && mv ./kubectl /usr/local/bin/kubectl \
    && curl https://dl.google.com/dl/cloudsdk/release/google-cloud-sdk.tar.gz > /tmp/google-cloud-sdk.tar.gz \
    && mkdir -p /usr/local/gcloud \
    && tar -C /usr/local/gcloud -xvf /tmp/google-cloud-sdk.tar.gz \
    && /usr/local/gcloud/google-cloud-sdk/install.sh 
    
CMD ["./bin/hubot","--adapter","slack"]
