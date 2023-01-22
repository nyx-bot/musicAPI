const util = {};

const ffprobePath = require('child_process').execSync(`which ffprobe`).toString().trim()

console.log(`Using ffprobe path: "${ffprobePath}"`)

util.findBestAudioQuality = (json) => {
     let format_id = null, downloaderArgs = [], useFormat = null;

     if(json.formats && json.formats.length > 0) {
          let audioBitrates = json.formats.filter(o => {
              return !isNaN(o.abr) && o.abr > 1 && (o.asr || 0) <= 49000
          }).sort((a,b) => {
              const abitrate = a.abr * (a.asr || 1), bbitrate = b.abr * (b.asr || 1);
              console.log(`A-ABR: ${a.abr} / ${a.asr || 1} / ${abitrate} | B-ABR: ${b.abr} / ${b.asr || 1} / ${bbitrate}`)
              if(abitrate > bbitrate) {
                  return -1
              } else if(abitrate < bbitrate) {
                  return 1
              } else return 0
          }), bestAudio = audioBitrates[0];
     
          if(!bestAudio) {
              if(json.formats.length > 0) {
                  //return rej(`Unable to stream audio! (There are no audio streams available!)`)
                  console.warn(`THERE ARE NO DIRECT AUDIO STREAMS AVAILABLE -- trying highest quality...`);
     
                  audioBitrates = json.formats.sort((a,b) => {
                      const abitrate = a.tbr, bbitrate = b.tbr;
                      console.log(`A-TBR: ${abitrate} | B-TBR: ${bbitrate}`)
                      if(abitrate > bbitrate) {
                          return -1
                      } else if(abitrate < bbitrate) {
                          return 1
                      } else return 0
                  }); bestAudio = audioBitrates[0]
              }/* else {
                  return rej(`Unable to stream audio! (This source is not allowing me to play anything!)`)
              }*/
          };
     
          const bestAudioWithoutVideo = audioBitrates.filter(o => typeof o.vbr != `number`)[0];
     
          if(bestAudio) console.log(`best audio bitrate: ${bestAudio.abr} with sampling rate of ${bestAudio.asr}`);
     
          if(bestAudioWithoutVideo) console.log(`best audio bitrate (without video): ${bestAudioWithoutVideo.abr} with sampling rate of ${bestAudioWithoutVideo.asr}`);
     
          if(bestAudio && bestAudioWithoutVideo && bestAudio.abr && bestAudio.abr == bestAudioWithoutVideo.abr && bestAudio.asr == bestAudioWithoutVideo.asr) {
              console.log(`bestAudio is equivalent to bestAudioWithoutVideo, using without video!`);
              format_id = bestAudioWithoutVideo.format_id
          } else {
              if(bestAudio && bestAudioWithoutVideo) console.log(`bestAudio is NOT equivalent to bestAudioWithoutVideo (${bestAudio.abr} / ${bestAudio.asr} > ${bestAudioWithoutVideo.abr} / ${bestAudioWithoutVideo.asr})`);
              
              let difference = bestAudio && bestAudio.abr ? bestAudio.abr * (bestAudio.asr || 1) - (bestAudioWithoutVideo || {abr : 0}).abr * ((bestAudioWithoutVideo || {asr: 0}).asr || 1) : -11000;
     
              if(difference < 10000 && difference > -10000) {
                  console.log(`difference is less than 10kbps off, using audio anyways! (${`${difference}`.replace(`-`, ``)})\n| FORMAT: ${bestAudioWithoutVideo.format_id}`);
                  format_id = bestAudioWithoutVideo.format_id
              } else {
                  console.log(`difference is too high! (${`${difference}`.replace(`-`, ``)}) -- using video and extracting audio\n| FORMAT: ${bestAudio && bestAudio.format_id ? bestAudio.format_id : `NONE, YT-DLP IS ON ITS OWN THIS TIME`}`)
                  if(bestAudio && bestAudio.format_id) {
                      format_id = bestAudio.format_id
                      downloaderArgs.push(`--no-keep-video`);
     
                      /*if(startTimeArg) {
                          downloaderArgs.push(`--downloader`, `ffmpeg`, `--downloader-args`, `ffmpeg:-ss ${startTimeArg}`);
                      }*/
                  } else {
                      downloaderArgs.push(`--downloader`, `ffmpeg`);
     
                      let ffmpegArgs = `-vn`;
     
                      /*if(startTimeArg) {
                          ffmpegArgs = ffmpegArgs + ` -ss ${startTimeArg}`;
                          seeking = true;
                      }*/
     
                      downloaderArgs.push(`--downloader-args`, `ffmpeg:${ffmpegArgs}`)
                      //downloaderArgs.push(`--compat-options`, `multistreams`)
                      //downloaderArgs.push(`--dump-single-json`, `--no-simulate`)
                  }
              }
          };
     
          useFormat = json.formats.find(o => o.format_id == format_id);
     
          if(useFormat && useFormat.abr && !json.abr) {
               json.abr = useFormat.abr
          };
     
          json.streamAbr = (Number(json.abr) || 384) > 384 ? 384 : (json.abr || 384);
     }
     
     return {
          useFormat,
          format_id,
          downloaderArgs
     }
}

util.getAudioData = (location, headers, noCodecCopy) => new Promise(async res => {
     let data = {
          bitrate: null
     };

     let headersArr = []; Object.entries(typeof headers == `object` ? headers : {}).map(o => `${o[0]}: ${o[1]}`).forEach(h => headersArr.unshift(`-headers`, h));

     const query = require('child_process').spawn(`ffmpeg`, [...headersArr, `-i`, location, ...(noCodecCopy ? [] : [`-c:a`, `copy`]), `-f`, `opus`, `/dev/null`, `-y`, `-hide_banner`]);

     query.on(`error`, e => {
          console.warn(`Unable to use ffmpeg to determine audio quality of file! (${e}) / 2`);
          res(data)
     });

     let timer = null;

     let bitrates = [];

     let stderr = ``;

     query.stderr.on(`data`, d => {
          const log = d.toString().trim();

          stderr += `\n` + log

          let createTimer = () => {
               if(!timer) {
                    timer = setTimeout(() => query.kill(), 2500);
                    console.log(`ffmpeg query (${location}) -- got first bitrate thing! created timer to end this thing`)
               };
          }

          if(log.includes(`bitrate=`) && !log.split(`bitrate=`)[1].trim().startsWith(`N/A`)) {
               createTimer();
               const n = Number(log.split(`bitrate=`)[1].split(`kbit`)[0].trim())
               bitrates.push(n);
               console.log(`Bitrate update (${location}): ${n}`)
          };
     })

     query.on(`close`, (code, sig) => {
          console.log(`ffmpeg query for song ${location} ended with code ${code} / signal ${sig}`);

          if(code > 0) {
               if(stderr.includes(`incorrect codec parameters`)) {
                    return util.getAudioData(location, headers, true).then(res)
               } else console.log(`ffmpeg output since code was greater than 0:`, stderr)
          }

          data.bitrate = Math.round(bitrates.reduce((a,b) => a+b, 0)/bitrates.length);

          console.log(`Average bitrate of ${location}: ${data.bitrate}kbps`);

          res(data);
     })
})

util.ffprobe = (path) => require('ffprobe-client')(path, {
     path: ffprobePath
})

util.timestampStringToNum = function (ts) {
    if(!ts.includes(`:`)) return 0;
    const tsArr = ts.split(':').reverse();
    let finalNum = 0;//sec,  min,   hour,    day,      month,      year,        5 years,      50 years,      100 years,     500 years,      1000 years
    let conversions = [1000, 60000, 3600000, 86400000, 2592000000, 31536000000, 157700000000, 1577000000000, 3154000000000, 15770000000000, 31540000000000]
    for(i in tsArr) {
         finalNum = finalNum + Number(tsArr[Number(i)]) * (conversions[Number(i)])
    };
    return (finalNum)
}

util.convertMS = function(ms) {
    if(typeof ms != `number` && isNaN(ms)) return console.l(`ms in convertms is not a number!`);
    if(typeof ms == `string`) {ms = Number(ms)}
    var obj = {infinite: 0, year: 0, month: 0, day: 0, hour: 0, minute: 0, seconds: 0, ms};
    if(ms >= 2.3652e+14) {
         obj.infinite = 1
    } else {
         while(ms >= 31540000000000) {obj.year = obj.year + 1000; ms = ms-31540000000000}
         while(ms >= 15770000000000) {obj.year = obj.year + 500; ms = ms-15770000000000}
         while(ms >= 3154000000000) {obj.year = obj.year + 100; ms = ms-3154000000000}
         while(ms >= 1577000000000) {obj.year = obj.year + 50; ms = ms-1577000000000}
         while(ms >= 157700000000) {obj.year = obj.year + 5; ms = ms-157700000000}
         while(ms >= 31536000000) {obj.year++; ms = ms-31536000000}
         while(ms >= 2592000000) {obj.month++; ms = ms-2592000000}
         while(ms >= 86400000) {obj.day++; ms = ms-86400000}
         while(ms >= 3600000) {obj.hour++; ms = ms-3600000}
         while(ms >= 60000) {obj.minute++; ms = ms-60000}
         while(ms >= 1000) {obj.seconds++; ms = ms-1000}
    }
    return obj;
}

util.timestampConvert = function (obj) {
    if(typeof obj == "number" || typeof obj == "string") {
         let num = Number(Math.round(Number(obj) / 1000)) * 1000;
         obj = util.convertMS(num);
    } else if(typeof obj == `object` && obj.length !== undefined) {
         let num = Number(Math.round(Number(obj[0]) / 1000)) * 1000;
         obj = util.convertMS(num);
    }
    let string = null;
    if(obj.infinite) {
         string = `--:--`
    } else {
         let array = [];
         if(obj.year < 10) {
              obj.year = `0${obj.year}`;
         }
         if(obj.year === 0) {
              obj.year = `00`;
         }
         array.push(`${obj.year}`);
         if(obj.month < 10) {
              obj.month = `0${obj.month}`;
         }
         if(obj.month === 0) {
              obj.month = `00`;
         }
         array.push(`${obj.month}`);
         if(obj.day < 10) {
              obj.day = `0${obj.day}`;
         }
         if(obj.day === 0) {
              obj.day = `00`;
         }
         array.push(`${obj.day}`);
         if(obj.hour < 10) {
              obj.hour = `0${obj.hour}`;
         }
         if(obj.hour === 0) {
              obj.hour = `00`;
         }
         array.push(`${obj.hour}`);
         if(obj.minute < 10) {
              obj.minute = `0${obj.minute}`;
         }
         if(obj.minute === 0) {
              obj.minute = `00`;
         }
         array.push(`${obj.minute}`);
         if(obj.seconds < 10) {
              obj.seconds = `0${obj.seconds}`;
         }
         if(obj.seconds === 0) {
              obj.seconds = `00`;
         }
         array.push(`${obj.seconds}`);
         let startAt = null;
         let checked = 0;
         array.forEach((num) => {
              if(startAt === null) {
                   if(!(num == "00") && Number(num) > 0) {
                        startAt = checked;
                   }
              }
              checked = checked + 1;
         });
         if(startAt === null) {
              return "--:--";
         }
         let numGoing = startAt;
         while (!(numGoing == array.length)) {
              if(!string) {
                   string = `${array[numGoing]}`;
              } else {
                   string = `${string}:${array[numGoing]}`;
              }
              numGoing = numGoing + 1;
         }
         if(!string) {
              return `--:--`;
         }
         if(string.length === 2) {
              string = `00:${string}`;
         }
    }

    return string;
}

let timestampStringToNum = function (ts) {
     if(!ts.includes(`:`)) return 0;
     const tsArr = ts.split(':').reverse();
     let finalNum = 0;//sec,  min,   hour,    day,      month,      year,        5 years,      50 years,      100 years,     500 years,      1000 years
     let conversions = [1000, 60000, 3600000, 86400000, 2592000000, 31536000000, 157700000000, 1577000000000, 3154000000000, 15770000000000, 31540000000000]
     for(i in tsArr) {
          finalNum = finalNum + Number(tsArr[Number(i)]) * (conversions[Number(i)])
     };
     return (finalNum)
 }
 
 let convertMS = function(ms) {
     if(typeof ms != `number` && isNaN(ms)) return console.error(`ms in convertms is not a number!`);
     if(typeof ms == `string`) {ms = Number(ms)}
     var obj = {infinite: 0, year: 0, month: 0, day: 0, hour: 0, minute: 0, seconds: 0, ms};
     if(ms >= 2.3652e+14 || ms === Infinity) {
         obj.infinite = 1
     } else {
         obj.year = Math.floor(ms/31536000000); ms = ms-(obj.year * (31536000000))
         obj.month = Math.floor(ms/2592000000); ms = ms-(obj.month * (2592000000))
         obj.day = Math.floor(ms/86400000); ms = ms-(obj.day * (86400000))
         obj.hour = Math.floor(ms/3600000); ms = ms-(obj.hour * (3600000))
         obj.minute = Math.floor(ms/60000); ms = ms-(obj.minute * (60000))
         obj.seconds = Math.floor(ms/1000); ms = ms-(obj.seconds * (1000))
     }
     return obj;
 }
 
 let timeConvert = function (obj, setting, givenLimit) {
      let limit = undefined;
      if(!isNaN(givenLimit)) {
           limit = Math.round(givenLimit);
      }
      if(typeof obj == "number" || typeof obj == "string") {
           let num = Number(Math.round(Number(obj) / 1000)) * 1000;
           obj = convertMS(num);
      };
      if(obj.infinite) {
           return (`∞`)
      } else {
           if(limit === undefined) {limit = Object.entries(obj).length-1}
           let p = {
                year: " years",
                month: " months",
                day: " days",
                hour: " hours",
                minute: " minutes",
                second: " seconds",
                yearone: " year",
                monthone: " month",
                dayone: " day",
                hourone: " hour",
                minuteone: " minute",
                secondone: " second",
           };
           if(setting) {
                p = {
                     year: "y",
                     month: "mo",
                     day: "d",
                     hour: "h",
                     minute: "m",
                     second: "s",
                     yearone: "y",
                     monthone: "mo",
                     dayone: "d",
                     hourone: "h",
                     minuteone: "m",
                     secondone: "s",
                };
           }
           let timeff = obj;
           let count = 0;
           let time = "";
           if(limit === 0) {
                return (time);
           }
           if(timeff.ms < 1000) {
                time = `0${p.second}`;
                return (time)
           } else {
                if(!(timeff.year === 0)) {
                     if(limit === 1) {
                          if(timeff.year === 1) {
                               time = `${time} and ${timeff.year}${p.yearone}`;
                          } else {
                               time = `${time} and ${timeff.year}${p.year}`;
                          }
                     } else {
                          if(count === 0) {
                               if(timeff.year === 1) {
                                    time = `${timeff.year}${p.yearone}`;
                               } else {
                                    time = `${timeff.year}${p.year}`;
                               }
                          } else {
                               if(timeff.year === 1) {
                                    time = `${time}, ${timeff.year}${p.yearone}`;
                               } else {
                                    time = `${time}, ${timeff.year}${p.year}`;
                               }
                          }
                     }
                     limit--; count++
                }; if(limit === 0) return (time);
                if(!(timeff.month === 0)) {
                     if(limit === 1) {
                          if(timeff.month === 1) {
                               time = `${time} and ${timeff.month}${p.monthone}`;
                          } else {
                               time = `${time} and ${timeff.month}${p.month}`;
                          }
                     } else {
                          if(count === 0) {
                               if(timeff.month === 1) {
                                    time = `${timeff.month}${p.monthone}`;
                               } else {
                                    time = `${timeff.month}${p.month}`;
                               }
                          } else {
                               if(timeff.month === 1) {
                                    time = `${time}, ${timeff.month}${p.monthone}`;
                               } else {
                                    time = `${time}, ${timeff.month}${p.month}`;
                               }
                          }
                     }
                     limit--; count++
                }; if(limit === 0) return (time);
                if(!(timeff.day === 0)) {
                     if(limit === 1) {
                          if(timeff.day === 1) {
                               time = `${time} and ${timeff.day}${p.dayone}`;
                          } else {
                               time = `${time} and ${timeff.day}${p.day}`;
                          }
                     } else {
                          if(count === 0) {
                               if(timeff.day === 1) {
                                    time = `${timeff.day}${p.dayone}`;
                               } else {
                                    time = `${timeff.day}${p.day}`;
                               }
                          } else {
                               if(timeff.day === 1) {
                                    time = `${time}, ${timeff.day}${p.dayone}`;
                               } else {
                                    time = `${time}, ${timeff.day}${p.day}`;
                               }
                          }
                     }
                     limit--; count++
                }; if(limit === 0) return (time);
                if(!(timeff.hour === 0)) {
                     if(limit === 1) {
                          if(timeff.hour === 1) {
                               time = `${time} and ${timeff.hour}${p.hourone}`;
                          } else {
                               time = `${time} and ${timeff.hour}${p.hour}`;
                          }
                     } else {
                          if(count === 0) {
                               if(timeff.hour === 1) {
                                    time = `${timeff.hour}${p.hourone}`;
                               } else {
                                    time = `${timeff.hour}${p.hour}`;
                               }
                          } else {
                               if(timeff.hour === 1) {
                                    time = `${time}, ${timeff.hour}${p.hourone}`;
                               } else {
                                    time = `${time}, ${timeff.hour}${p.hour}`;
                               }
                          }
                     }
                     limit--; count++
                }; if(limit === 0) return (time);
                if(!(timeff.minute === 0)) {
                     if(limit === 1) {
                          if(timeff.minute === 1) {
                               time = `${time} and ${timeff.minute}${p.minuteone}`;
                          } else {
                               time = `${time} and ${timeff.minute}${p.minute}`;
                          }
                     } else {
                          if(count === 0) {
                               if(timeff.minute === 1) {
                                    time = `${timeff.minute}${p.minuteone}`;
                               } else {
                                    time = `${timeff.minute}${p.minute}`;
                               }
                          } else {
                               if(timeff.minute === 1) {
                                    time = `${time}, ${timeff.minute}${p.minuteone}`;
                               } else {
                                    time = `${time}, ${timeff.minute}${p.minute}`;
                               }
                          }
                     }
                     limit--; count++
                }; if(limit === 0) return (time);
                if(!(timeff.seconds === 0)) {
                     if(limit === 1) {
                          if(timeff.seconds === 1) {
                               time = `${time} and ${timeff.seconds}${p.secondone}`;
                          } else {
                               time = `${time} and ${timeff.seconds}${p.second}`;
                          }
                     } else {
                          if(count === 0) {
                               if(timeff.seconds === 1) {
                                    time = `${timeff.seconds}${p.secondone}`;
                               } else {
                                    time = `${timeff.seconds}${p.second}`;
                               }
                          } else {
                               if(timeff.seconds === 1) {
                                    time = `${time}, ${timeff.seconds}${p.secondone}`;
                               } else {
                                    time = `${time}, ${timeff.seconds}${p.second}`;
                               }
                          }
                     }
                     limit--; count++
                }; return (time);
           }
      }
 };
 
 let timestampConvert = function (obj) {
     if(typeof obj == "number" || typeof obj == "string") {
          let num = Number(Math.round(Number(obj) / 1000)) * 1000;
          obj = convertMS(num);
     } else if(typeof obj == `object` && obj.length !== undefined) {
          let num = Number(Math.round(Number(obj[0]) / 1000)) * 1000;
          obj = convertMS(num);
     };
     obj = { ...obj }
     let string = null;
     if(obj.infinite) {
          string = `--:--`
     } else {
          let array = [];
          if(obj.year < 10) {
               obj.year = `0${obj.year}`;
          }
          if(obj.year === 0) {
               obj.year = `00`;
          }
          array.push(`${obj.year}`);
          if(obj.month < 10) {
               obj.month = `0${obj.month}`;
          }
          if(obj.month === 0) {
               obj.month = `00`;
          }
          array.push(`${obj.month}`);
          if(obj.day < 10) {
               obj.day = `0${obj.day}`;
          }
          if(obj.day === 0) {
               obj.day = `00`;
          }
          array.push(`${obj.day}`);
          if(obj.hour < 10) {
               obj.hour = `0${obj.hour}`;
          }
          if(obj.hour === 0) {
               obj.hour = `00`;
          }
          array.push(`${obj.hour}`);
          if(obj.minute < 10) {
               obj.minute = `0${obj.minute}`;
          }
          if(obj.minute === 0) {
               obj.minute = `00`;
          }
          array.push(`${obj.minute}`);
          if(obj.seconds < 10) {
               obj.seconds = `0${obj.seconds}`;
          }
          if(obj.seconds === 0) {
               obj.seconds = `00`;
          }
          array.push(`${obj.seconds}`);
          let startAt = null;
          let checked = 0;
          array.forEach((num) => {
               if(startAt === null) {
                    if(!(num == "00") && Number(num) > 0) {
                         startAt = checked;
                    }
               }
               checked = checked + 1;
          });
          if(startAt === null) {
               return "--:--";
          }
          let numGoing = startAt;
          while (!(numGoing == array.length)) {
               if(!string) {
                    string = `${array[numGoing]}`;
               } else {
                    string = `${string}:${array[numGoing]}`;
               }
               numGoing = numGoing + 1;
          }
          if(!string) {
               return `--:--`;
          }
          if(string.length === 2) {
               string = `00:${string}`;
          }
     }
 
     return string;
 };
 
 util.time = (content) => {
     let returnObject = {
         timestamp: `--:--`,
         string: ``,
         units: {
             infinite: 0, 
             year: 0, 
             month: 0, 
             day: 0, 
             hour: 0, 
             minute: 0, 
             seconds: 0, 
             ms: 0
         }
     }
 
     if(typeof content == `string`) {
         if(content.includes(`:`)) {
             returnObject.units = convertMS(timestampStringToNum(content));
             returnObject.timestamp = timestampConvert(returnObject.units);
             returnObject.string = timeConvert(returnObject.units, false, 3);
             return returnObject;
         } else if(Number(content)) {
             returnObject.units = convertMS(Number(content))
             returnObject.timestamp = timestampConvert(returnObject.units);
             returnObject.string = timeConvert(returnObject.units, false, 3);
             return returnObject;
         } else return returnObject;
     } else if(typeof content == `number`) {
         returnObject.units = convertMS(content);
         returnObject.timestamp = timestampConvert(returnObject.units);
         returnObject.string = timeConvert(returnObject.units, false, 3);
         return returnObject;
     } else if(typeof content == `object`) {
         try {
             if(JSON.stringify(Object.keys(content).sort()) === JSON.stringify(Object.keys(returnObject.units).sort())) {
                 returnObject.units = content;
                 returnObject.timestamp = timestampConvert(returnObject.units);
                 returnObject.string = timeConvert(returnObject.units, false, 3);
                 return returnObject;
             } else return returnObject
         } catch(e) {return returnObject;}
     } else return returnObject;
};

util.idGen = (num) => {
     let retVal = "";
     let charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
     var length = 5;
     if(num) {
          length = Math.round(num);
     }
     for (var i = 0, n = charset.length; i < length; ++i) {
          retVal += charset.charAt(Math.floor(Math.random() * n));
     }
     return retVal;
}

module.exports = util