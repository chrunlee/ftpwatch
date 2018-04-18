var chokidar = require('chokidar');
var target = "";
var config = require('./data');
var path = require('path');
var async = require('async');

var fs = require('fs');
var superagent = require('superagent');
var Util = require('./Util');
Util.log('服务器启动，开始对目标目录进行监听:'+config.ftp);
var watcherIns = null;
watcherIns = chokidar.watch(config.ftp,{
	persistent : true
});
//

function loopExe (){
	var fileName = Util.getError();
	if(fileName){
		Util.log('处理错误信息:['+fileName+']');
		exeFileOpt(fileName);
	}

	setTimeout(function(){
		loopExe();	
	},10000);//每5s执行一次,超过三次放弃
}
loopExe();//执行

function exeFileOpt ( newName,filePath ){
	if(filePath){
		var createTime= Util.getBirthTime(filePath);
		Util.log('['+newName+']获得文件创建时间:'+createTime);
		Util.cache[newName].time = createTime;
	}
	
	//3.对图片进行分割：4部分，r/b/l/t--右上角、右下角、左下角、左上角；
	async.waterfall([
		function(callback){
			Util.split(newName,callback);
		},
		function(fileName,callback){
			Util.rotate(fileName,callback);
		},
		function(fileName,callback){
			Util.copy(fileName,callback);
		},
		function(fileName,callback){
			Util.thumb(fileName,callback);
		},
		function(fileName,callback){
			Util.send(fileName,callback);
		}
	],function(err,result){
		if(err){
			console.log(err);
			Util.log('['+newName+']执行过程报错');
			Util.addError();
			Util.pushError(newName);
			//错误机制如何来处理????????????????????????????????????
		}else{
			Util.log('['+newName+']执行完毕');
			Util.addSuccess();
			Util.deleteError(newName);
		}
	});
}

watcherIns.on('add',function(filePath){
	//获得图片，再查找data.json 的内容
	Util.log('监测到有文件添加进入,文件路径为:'+filePath);
	var newName = Util.guid(filePath);//获得名称
	Util.log('随机获得文件的新名字:'+newName)
	exeFileOpt(newName,filePath);
	
});

module.exports = {};