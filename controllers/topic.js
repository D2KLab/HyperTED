import axios from 'axios';
import config from '../config.json';

const API_INSTANCE = config.topicmodel;
const NodeCache = require('node-cache');

const cache = new NodeCache();

async function topic2labels(id, modelName) {
  let topics;
  if (!cache.has(`topics_${modelName}`)) {
    // get topics names if not in cache
    const body = await axios.get(`${API_INSTANCE + modelName}/topics`);
    topics = body.data.topics;
    cache.set(`topics_${modelName}`, topics, 5000);
  } else topics = cache.get(`topics_${modelName}`);

  const { words } = topics[id];
  return words.slice(0, 5);
}

export default async function (text, modelName) {
  const api = `${API_INSTANCE}${modelName}/predict`;

  const inf = await axios.get(api, { params: { text } });
  const items = inf.data.results;

  if (!items.length) return [];

  // the best topic is the first in the list
  const [id, conf] = items[0];
  if (conf < 0.2) return [];

  return topic2labels(id, modelName);
}
