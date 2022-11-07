const fs = require('fs');

module.exports = {
    endpoint: `/getInfo/:url(*+)`,
    type: `get`,
    func: async ({util, keys}, req, res) => {
        const queryString = Object.entries(req.query).map((q, index) => `${index === 0 ? `?` : `&`}${q[0]}=${q[1]}`).join(``);
        const link = req.params.url + queryString;
        console.log(link);

        require('../func/getInfo')(link, keys).then(json => {
            let o = {
                title: json.title || null,
                author: {
                    name: json.uploader,
                    link: json.uploader_url,
                },
                duration: json.duration ? util.time(json.duration * 1000) : null,
                genre: json.genre || null,
                url: json.webpage_url,
                likes: json.like_count || null,
                hits: json.view_count || null,
                thumbnail: {
                    width: json.thumbnail.width,
                    height: json.thumbnail.height,
                    url: json.thumbnail.url
                },
            };

            if(json.entries && json.entries.length > 0) {
                o.entries = json.entries.map(json2 => {
                    console.log(json2)

                    let url = json2.webpage_url;

                    if(url == link || !url) {
                        url = json2.url
                    }

                    return {
                        title: json2.title || null,
                        author: {
                            name: json2.uploader,
                            link: json2.uploader_url,
                        },
                        duration: json2.duration ? util.time(json2.duration * 1000) : 0,
                        previewDuration: json2.formats[0].format_id == `preview` ? 30000 : undefined,
                        genre: json2.genre || null,
                        url,
                        likes: json2.like_count || null,
                        hits: json2.view_count || null,
                        thumbnail: {
                            width: json2.thumbnail.width,
                            height: json2.thumbnail.height,
                            url: json2.thumbnail.url
                        },
                    }
                });
            }

            res.send(o);
        }).catch(e => {
            console.error(e);
            res.status(500).send({
                error: true,
                message: `Could not fetch information! (${e})`
            })
        })
    }
}