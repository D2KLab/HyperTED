FROM node:13

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install --production

# Bundle app source
COPY . .
COPY config-prod.json config.json

EXPOSE 8011
CMD [ "node", "index.js" ]
