const fs = require('fs');

module.exports = {
    endpoint: `/getInfo/:url(*+)`,
    type: `get`,
    func: async ({util, keys}, req, res) => {
        const queryString = Object.entries(req.query).map((q, index) => `${index === 0 ? `?` : `&`}${q[0]}=${q[1]}`).join(``);
        const link = req.params.url + queryString;
        console.log(link);

        require('../func/getInfo')(link, keys).then(json => {
            const o = {
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
            }
            res.send(o); console.log(o)
        }).catch(e => {
            console.error(e);
            res.status(500).send({
                error: true,
                message: `Could not fetch information! (${e})`
            })
        })
    }
}