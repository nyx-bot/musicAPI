module.exports = {
    endpoint: `/createYoutubeMix/:url(*+)`,
    type: `get`,
    func: async ({util, keys}, req, res) => {
        const queryString = Object.entries(req.query).map((q, index) => `${index === 0 ? `?` : `&`}${q[0]}=${q[1]}`).join(``);
        const link = req.params.url + queryString;
        console.log(link);

        const data = {}

        await new Promise(async res => {
            console.log(`using getInfo for song because URL was provided!`);

            const parse = (o) => {
                if(o.title) data.title = o.title;
                if(o.author && o.author.name) data.artist = o.author.name;
                if(o.duration && o.duration.units && o.duration.units.ms) data.duration = o.duration.units.ms;
                if(o.source) data.source = o.source;
                data.url = o.url || link;
                res()
            }

            require(`./getInfo`).func({util, keys}, {
                query: {},
                body: {
                    noDownload: true,
                },
                params: {
                    url: link
                }
            }, {
                status: () => {
                    return {
                        send: parse,
                    }
                },
                send: parse
            })
        });

        console.log(`[INFO]\n| Source: ${data.source}\n| Title: ${data.title}\n| URL: ${data.url}`)

        if(data.source != `youtube`) await new Promise(async res => {
            require('../func/generalSong')({
                keys,

                source: `youtube`,

                title: data.title || null,
                artist: data.artist || null,
                duration: data.duration || null
            }).then(r => {
                console.log(r);
                if(r.top) {
                    data.source = `youtube`;
                    data.url = r.top.url;
                    data.title = r.top.title;
                    data.artist = r.top.artists[0];
                    data.duration = r.top.duration[0];
                    res(data);
                } else res(null)
            }).catch(e => {
                console.error(`FAILED TO FIND YOUTUBE EQUIVALENT`, e)
                res(null)
            })
        });

        if(data.source != `youtube`) {
            console.log(`Source was still not youtube. Returning error.`)
            return res.send({
                error: true,
                message: `Unable to find a YouTube equivalent of this song!`
            })
        } else {
            console.log(`[INFO AFTER PARSE]\n| Source: ${data.source}\n| Title: ${data.title}\n| URL: ${data.url}`);

            let id = data.url.includes(`?v=`) ? data.url.split(`?v=`)[1].split(`&`)[0] : data.url.includes(`&v=`) ? data.url.split(`&v=`)[1].split(`&`)[0] : null;

            if(!id) {
                console.log(`Was not able to parse ID out of URL.`);
                return res.send({
                    error: true,
                    message: `[Internal Error] Unable to parse ID of link.`
                });
            } else {
                require(`./getInfo`).func({util, keys}, {
                    query: {},
                    body: {
                        noDownload: true,
                    },
                    params: {
                        url: `https://music.youtube.com/watch?v=${id}&list=RDAMVM${id}`
                    }
                }, res)
            }
        }
    }
}