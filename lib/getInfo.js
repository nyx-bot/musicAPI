const fs = require('fs');

module.exports = {
    endpoint: `/getInfo/:url(*+)`,
    type: `get`,
    func: async ({util, keys}, req, res) => {
        const queryString = Object.entries(req.query).map((q, index) => `${index === 0 ? `?` : `&`}${q[0]}=${q[1]}`).join(``);
        const link = req.params.url + queryString;
        console.log(link);

        const noDownload = req.body ? req.body.noDownload || false : false;
        const waitForDownload = req.body ? req.body.waitForDownload || false : false;

        console.log(`noDownload: ${noDownload} / waitForDownload: ${waitForDownload}`)

        require('../func/getInfo')(link, keys, typeof noDownload == `boolean` ? noDownload : false, typeof waitForDownload == `boolean` ? waitForDownload : true).then(json => {
            if(json) {
                const { useFormat } = require(`../util`).findBestAudioQuality(json);

                if(json.channel && !json.uploader) json.uploader = json.channel
                if(json.channel_url && !json.uploader_url) json.uploader_url = json.channel_url
                
                if(json.uploader.endsWith(` - Topic`)) json.uploader = json.uploader.substring(0, json.uploader.length - ` - Topic`.length);

                console.log(`JSON OBJECTS`, json.website, json.source, json.extractor)
    
                let o = {
                    title: json.title || null,
                    author: {
                        name: json.uploader,
                        link: json.uploader_url,
                    },
                    duration: json.duration ? util.time(json.duration * 1000) : null,
                    previewDuration: json && json.formats && json.formats[0].format_id == `preview` ? 30000 : undefined,
                    bitrate: useFormat ? useFormat.abr : json.abr || null,
                    streamableBitrate: json.streamAbr || 384,
                    genre: json.genre || null,
                    url: json.webpage_url,
                    likes: json.like_count || null,
                    hits: json.view_count || null,
                    source: json.extractor,
                    thumbnail: {
                        width: json.thumbnail.width,
                        height: json.thumbnail.height,
                        url: json.thumbnail.url
                    },
                };
    
                if(json.entries && json.entries.length > 0) {
                    if(o.duration === null && json.entries.filter(o => o.duration > 0).length > 0) {
                        const totalTime = json.entries.reduce((a,b) => {
                            b = b.duration;
    
                            if(typeof a != `number`) a = 0;
                            if(typeof b != `number`) b = 0;
    
                            b = b * 1000;
    
                            return a + b
                        });
    
                        o.duration = util.time(totalTime);
    
                        console.log(`Updated playlist duration with total time from entries! (totalTime: ${totalTime})`, o.duration)
                    }
    
                    o.entries = json.entries.map(json2 => {
                        if(json2.channel && !json2.uploader) json2.uploader = json2.channel
                        if(json2.channel_url && !json2.uploader_url) json2.uploader_url = json2.channel_url
    
                        if(`${json2.uploader}`.endsWith(` - Topic`)) json2.uploader = json2.uploader.substring(0, json2.uploader.length - ` - Topic`.length)
    
                        let url = json2.webpage_url;
    
                        if(url == link || !url) {
                            url = json2.url
                        };

                        if(!json2.uploader && !json2.duration) {
                            console.log(`potential null media for ${json2.title} / ${json2.url}; returning nothing.`);
                            return null;
                        } else return {
                            title: json2.title || null,
                            author: {
                                name: json2.uploader,
                                link: json2.uploader_url,
                            },
                            duration: json2.duration ? util.time(json2.duration * 1000) : 0,
                            previewDuration: json2.formats && json2.formats[0].format_id == `preview` ? 30000 : undefined,
                            genre: json2.genre || null,
                            url,
                            likes: json2.like_count || null,
                            hits: json2.view_count || null,
                            source: json.extractor,
                            thumbnail: {
                                width: json2.thumbnail.width,
                                height: json2.thumbnail.height,
                                url: json2.thumbnail.url
                            },
                        }
                    }).filter(o => o ? true : false);
                }
    
                res.send(o);
            } else {
                console.error(`Nothing was sent back`, link);
                res.status(500).send({
                    error: true,
                    message: `Could not fetch information! (There was an internal error)`
                })
            }
        }).catch(e => {
            console.error(e);
            res.status(500).send({
                error: true,
                message: `Could not fetch information! (${e})`
            })
        })
    }
}