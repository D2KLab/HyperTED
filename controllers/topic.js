import config from '../config.json';

const API_INSTANCE = config.topicmodel;
const request = require('request');
const NodeCache = require('node-cache');
const cache = new NodeCache();


export default function (text, modelName) {

  console.log(text);
  let p = new Promise((resolve, reject) => {
    request.post({
    headers: {'content-type' : 'application/json'},
    url: API_INSTANCE+modelName+'/predict',
    json: {text: text}
    }, function(error, response, body){

      try{
          if(response && !response.error){
          let inf = JSON.parse(body);

          let items = inf.results;


          if (Object.keys(items).length === 0){
              resolve(['','','','','']);
            }

          if(modelName != 'tfidf'){
            const options = {
              url: API_INSTANCE+modelName+'/topics',
              method: 'GET'
            };

            let topic_id = Object.keys(items[0])[0];

            if(items[0][topic_id] > 0.2){
                if(!cache.has('topics_'+modelName)){
                  // console.log("\n\nNOT FOUND IN CACHE");
                  request(options, function(err, res, body) {
                    if(!err){
                      let topics = JSON.parse(body)['topics'];

                      cache.set( 'topics_'+modelName, topics, 5000 );

                      // var words = Object.keys(json).map(function(key) {
                      //   return [key, json[key]];
                      // });

                      // words.sort(function(first, second) {
                      //   return second[1] - first[1];
                      // });

                      console.log(topic_id);

                      let words = topics[topic_id]['words']

                      // console.log(topics);
                      // console.log(words);

                      resolve(words.slice(0,5));
                    }else{
                      reject("Error occured in retrieving modeled topics.")
                    }
                  });
                }else{
                  let topics = cache.get('topics_'+modelName);
                  // console.log("\n\nFOUND IN CACHE");
                  // console.log(topics);
                  console.log(topic_id);
                  let words = topics[topic_id]['words'];
                  // console.log(words);
                  resolve(words.slice(0,5));
                }
              }else{
                resolve(['','','','','']);
              }
          }else{
            resolve(items)
          }
        }else{
          reject("\n\nError occured in making inference.\n\n")
        }
      }
      catch(error){
        reject("\n\nError occured in making inference.\n\n")
      }

      
    });
  });
  return p;
}
