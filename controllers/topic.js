import axios from 'axios';
import config from '../config.json';

const API_INSTANCE = config.topicmodel;
const NodeCache = require('node-cache');

const cache = new NodeCache();


export default function (text, modelName) {
  const api = `${API_INSTANCE}${modelName}/predict`;
  console.log(api);
  return axios.post(api, text,
    { headers: { 'Content-Type': 'text/plain' } })
    .then((inf) => {
      const items = inf.data.results;
      console.log(items);
      if (!Object.keys(items).length) return ['', '', '', '', ''];

      if (modelName !== 'tfidf') {
        const id = Object.keys(items[0])[0];

        if (items[0][id] < 0.2) return ['', '', '', '', ''];

        if (!cache.has(`topics_${modelName}`)) {
          // console.log("\n\nNOT FOUND IN CACHE");
          console.log(`${API_INSTANCE + modelName}/topics`);
          return axios.get(`${API_INSTANCE + modelName}/topics`)
            .then((body) => {
              const { topics } = body.data;

              cache.set(`topics_${modelName}`, topics, 5000);

              const { words } = topics[id];
              return words.slice(0, 5);
            });
        }
        const topics = cache.get(`topics_${modelName}`);
        // console.log("\n\nFOUND IN CACHE");
        // console.log(topics);
        const { words } = topics[id];
        return words.slice(0, 5);
      }
      return items;
    });
}
