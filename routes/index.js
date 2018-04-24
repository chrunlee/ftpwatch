var express = require('express');
var router = express.Router();
var fs = require('fs');
var moment = require('moment');
var path = require('path');
var formidable = require('formidable');
/* GET home page. */
router.get('/', function(req, res, next) {
  //获得统计信息

  //获得日志信息
  var d = moment(new Date()).format('YYYY-MM-DD');
  var logPath = path.join(path.dirname(__dirname) , 'logs',d+'.log');
  var tongji = require('../analysis.json');
  var rs = {
  	log : '今天没有日志记录',
  	all : tongji.all || 0,
  	today : tongji[d] || 0,
  	error : tongji.error || 0
  };
  if(fs.existsSync(logPath)){//文件存在，查出记录，最5后0条
  	var txt = fs.readFileSync(logPath);
  	txt = txt.toString();
  	// var arr = txt.split('\n');
  	// console.log(arr);
  	rs.log = txt;
  }
  //读取
  res.render('index', rs);
});
var isFormdata = function(req){
  var type = req.headers['content-type'] || '';
  return -1 < type.indexOf('multipart/form-data');
};

//测试上传和数据调用
router.post('/upload',function(req,res,next){
   //返回
    if(isFormdata(req)){
      var form = formidable.IncomingForm();
      form.uploadDir = 'tmp';
      form.parse(req,function(err,fileds,files){
        // var str = '获得字段:'+JSON.stringify(fileds);
        // str += 'file ='+files.file.name+';thumb='+files.thumb.name;
        //将文件复制到根目录下的 attachment
        res.end('{"filePath":"aa","thumb":"b"}');
      });
    }
})
router.post('/data',function(req,res,next){
  res.end('suc');
})


module.exports = router;
