module.exports = {
     endpoint: `/search/:arg(*+)`,
     func: async ({keys, idGen}, req, res) => require(`./findMatchingSong`).func({keys, idGen}, Object.assign({}, req, { 
          body: { 
               title: decodeURI(req.params.arg) 
          } 
     }), res)
}