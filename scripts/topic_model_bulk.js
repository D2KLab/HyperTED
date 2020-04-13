require = require('esm')(module); // eslint-disable-line
const Promise = require('bluebird');

let db = require('../controllers/database');
let video = require('../controllers/video');
let topic = require('../controllers/topic');

db = db.default;
video = video.default;
topic = topic.default;


async function processVideo(v, i, length) {
  console.log(`Processing video ${i}/${length}`);
  const subtitles = video.getTedChapters(v.jsonSub);
  return Promise.each(subtitles, async (chapter, chap) => {
    const topics = await topic(chapter.content, 'lda');
    return db.saveTopics(topics, v.uuid, chap, 'lda');
  });
}

async function run() {
  const videos = await db.getAllVideos('ted');

  Promise.each(videos,
    (v, i, length) => db.getTopics(v.uuid)
      .then((topics) => {
        if (!topics.length) return processVideo(v, i, length);
        return Promise.resolve(true);
      }));
}


run();
