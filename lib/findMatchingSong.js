module.exports = {
    endpoint: `/findMatchingSong`,
    type: `post`,
    //buffer: false,
    func: async ({util, keys, idGen}, req, res) => {
        try {
            if(req.body.url) await new Promise(async res => {
                console.log(`using getInfo for song because URL was provided!`);

                const parse = (o) => {
                    if(o.title) req.body.title = o.title;
                    if(o.author && o.author.name) req.body.artist = o.author.name;
                    if(o.duration) req.body.duration = o.duration;
                    res()
                }

                require(`./getInfo`)({util, keys}, {
                    params: {
                        url: req.body.url
                    },
                    body: {
                        noDownload: true,
                    }
                }, {
                    status: () => {
                        return {
                            send: parse,
                        }
                    },
                    send: parse
                })
            })

            console.log(req.body);

            const obj = {
                results: await (require('../func/generalSong'))({
                    keys,

                    source: req.body.service,

                    title: req.body.title || req.body.query || null,
                    artist: req.body.artist || req.body.author || null,
                    duration: req.body.duration || null
                })
            };

            res.send(obj)
        } catch(e) {
            res.status(500);
            res.send({
                error: true,
                message: `Unable to search songs!`,
            })
        }
    }
}
