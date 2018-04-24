/***
1.处理图片操作
2.处理二维码
3.处理位置
***/

var gm = require('gm');//图片操作
var magick = gm.subClass({imageMagick : true});//实体
// var magick =require('gm').subClass({ imageMagick : true });
// var gm = require('gm');
var fs = require('fs');//文件操作
var QrCode = require('qrcode-reader');//二维码读取
var Jimp = require('jimp');//bitmap
var moment = require('moment');//moment
var path = require('path');
var async = require('async');
var config = require('./data');
var superagent = require('superagent');
var AccurateScan = require('./AccurateScan');

var Util = {
	debug : true,
	queue : [],//存放执行对象队列{}
	run : [],//正在执行中
	cache : {},//存放每一个图片的具体信息
	// error : {},//存放错误的具体信息
	// delay : {},//存放延迟处理的文件夹集合
	suc : {
		total : 0,
		suc : 0
	}
};

//插入队列
Util.pushQueue = function(guid){
	var info = Util.cache[guid];
	Util.queue.push(info);
};
//获得队列对象
Util.getQueue = function(){
	var max = config.max;
	var queue = Util.queue,
		run = Util.run;
	if(queue.length == 0){
		return 0;
	}
	if(run.length >= max){
		return -1;
	}
	var obj = queue.shift();
	run.push(obj);
	return obj;
}
Util.delete = function( guid ){//执行完毕
	//删除run中
	var index = -1;
	var run = Util.run;
	if(run.length > 0){
		run.forEach(function(item,ldx){
			if(item.guid === guid){
				index = ldx;
			}
		});
		run.splice( index , 1);
	}
}
/**
 * 错误机制
 * 1. 将错误的图片放在内存中
 * 2. 定时去处理错误的信息(比如五分钟处理一次？或者一分钟检查一次)
 * 3. 将成功后的文件消灭掉，并更新
 **/

Util.addCode = function(num){
	Util.suc.total += 2;
	Util.suc.suc += num;
}
Util.getCode = function(){
	var total = Util.suc.total;
	var suc = Util.suc.suc;
	console.log('截止到目前，共计识别二维码个数:'+total+',识别成功:'+suc+'个,成功率:'+(suc/total));
}
//添加错误信息
Util.pushError = function( fileName ){
	Util.delete(fileName);//删除run中对象
	var info = Util.cache[fileName];
	if(info){
		info.error = info.error || 0;
		if(info.error > 3){//三次处理
			//删除info
			Util.cache[fileName] = null;
			delete Util.cache[fileName];
		}else{
			info.error = info.error + 1;
			Util.cache[fileName] = info;
			//加入队列
			Util.pushQueue(fileName);
		}
	}
};



//成功+1
Util.addSuccess = function(){
	var data = require('./analysis');
	var all = data.all || 0;
	all ++ ;
	var now = moment(new Date()).format('YYYY-MM-DD');
	var today = data[now] || 0;
	today ++ ;
	data.all = all;
	data[now] = today;
	fs.writeFileSync('./analysis.json',JSON.stringify(data));
};
//失败+1
Util.addError = function(){
	var data = require('./analysis');
	var all = data.all || 0;
	all ++ ;
	var error = data.error || 0;
	error ++ ;
	data.all = all;
	data.error = error;
	fs.writeFileSync('./analysis.json',JSON.stringify(data));
}
//日志处理
Util.log = function(str){
	var now = moment(new Date()).format('YYYY-MM-DD HH:mm:ss');
	//1.打印
	str = typeof str === 'string' ? str : str.toString();
	var info = now +'\t'+str+'\n';
	Util.debug && console.log(info);
	//2.写入文件
	var nowDate = moment(new Date()).format('YYYY-MM-DD');
	var logPath = path.join(__dirname,'logs',nowDate+'.log');
	if(fs.existsSync(logPath)){
		fs.appendFile(logPath,info,function(err){
			if(err){
				console.log(err);
			}
		});
	}else{
		fs.writeFile(logPath,info,function(err){
			if(err){
				console.log(err);
			}
		});
	}
};
//对时间进行格式化
Util.format = function(time){
	return moment(time).format('YYYY-MM-DD HH:mm:ss');
};
//获得文件的创建时间
Util.getBirthTime = function(filePath){
	var stats = fs.statSync(filePath);
	return Util.format(stats.birthtime);
};
//根据固定格式获得文件时间
//AAAAAAA_20149419_141090_02222.jpg
Util.getFileTime = function(filePath){
	var fileName = path.basename(filePath);
	var fileTime = '';
	if(fileName.indexOf('_') > -1){
		var arr = fileName.split('_');
		if(arr.length > 2){
			var date = arr[1],
				time = arr[2];
			var str = date+time;
			if(moment(str,'YYYYMMDDHHmmss').isValid()){
				fileTime = moment(str,'YYYYMMDDHHmmss').format('YYYY-MM-DD HH:mm:ss');
			}
		}
	}
	return fileTime;
};
//获得随机ID
Util.guid = function(filePath){
	var guid = (+new Date()).toString( 32 ),i = 0;
    for ( ; i < 5; i++ ) {
        guid += Math.floor( Math.random() * 65535 ).toString( 32 );
    }
    while(Util.cache[guid]){
    	guid = Util.guid();
    }
    if(filePath){
    	Util.cache[guid] = {
    		guid : guid,
    		filePath : filePath,
    		extname : path.extname(filePath)
    	};
    }
    return guid;
};
//创建目录
Util.mkdirs = function( dirpath ){
	dirpath = path.dirname(dirpath);
	 try{
        if (!fs.existsSync(dirpath)) {
            var pathtmp;
            dirpath.split(/[/\\]/).forEach(function (dirname) {  //这里指用/ 或\ 都可以分隔目录  如  linux的/usr/local/services   和windows的 d:\temp\aaaa
                if (pathtmp) {
                    pathtmp = path.join(pathtmp, dirname);
                }else {
                    pathtmp = dirname;
                }
                if (!fs.existsSync(pathtmp)) {
                    if (!fs.mkdirSync(pathtmp, 0777)) {
                        return false;
                    }
                }
            });
        }
        return true; 
    }catch(e){
    	Util.log('文件夹目录创建失败:'+dirpath+'\n'+e.toString());
        return false;
    }
}
//对图片进行压缩
Util.thumb = function( fileName ,callback){
	var info = Util.cache[fileName];
	//将图片压缩
	var filePath = info.filePath;
	var date = moment(new Date()).format('YYYYMMDD');
	var extname = path.extname(filePath);
	//目标路径
	var newPath = '/byymoral/'+date+'/'+fileName+'-thumb'+extname;
	var targetPath = path.join(config.target,newPath);
	magick(filePath).resize(config.thumbWidth).density(config.dpi).write(targetPath,function(err){
		if(err){
			Util.log(err.toString());
		}
		info.thumb = newPath;
		Util.cache[fileName] = info;
		callback(null,fileName);
	});
};
//复制图片
Util.copy = function(fileName,callback){
	var info = Util.cache[fileName];
	var filePath = info.filePath;
	//给定时间
	var date = moment(new Date()).format('YYYYMMDD');
	var extname = path.extname(filePath);

	var newPath = '/byymoral/'+date+'/'+fileName+extname;
	//如果路径不存在，则创建

	Util.log('['+fileName+']移动后新路径为'+newPath);
	info.newPath = newPath;
	Util.cache[fileName] = info;
	//将图片移动到某位置
	var movePath = path.join(config.target,newPath);
	if(Util.mkdirs(movePath)){
		//复制过去,压缩后
		magick(filePath).density(config.dpi).quality(config.compressQuality).write(movePath,function(err){
			if(err){
				var data = fs.readFileSync(filePath);
				fs.writeFileSync(movePath,data);
				Util.log(err.toString());
			}
			Util.log('['+fileName+']复制成功,由'+filePath+'复制到'+newPath);
			callback(null,fileName);
		});
	}
};
//对buffer读取二维码内容
Util.readSimple = function(buffer){
	var qr = new QrCode();
    qr.callback = function(err2, value) {
        if (err2) {
        	//没有二维码
        	Util.log('['+fileName+']'+(['右上角','右下角','左下角','左上角'][pos])+'无二维码');
        	rs.has = false;
        	rs.msg = '图片没有二维码';
        	cb(null,rs);
        }else{
        	rs.has = true;
        	Util.log('['+fileName+']'+(['右上角','右下角','左下角','左上角'][pos])+'二维码内容:'+value.result);
        	rs.result = value.result;
	        //根据宽高计算位置和大小
	        cb(null,rs);
        }
    };
    qr.decode(blockimg.bitmap);
}
//识别二维码
Util.readCode = function(fileName,filePath,pos,cb){
	var rs = {
		has : false,
		pos : pos
	};
	//读取图片是否有二维码
	AccurateScan(filePath,function(err,value){
		fs.unlinkSync(filePath);
		if(err){
			//没有二维码
        	Util.log('['+fileName+']'+(['右上角','右下角','左下角','左上角'][pos])+'无二维码');
        	rs.has = false;
        	rs.msg = '图片没有二维码';
        	cb(null,rs);
		}else{
			rs.has = true;
        	Util.log('['+fileName+']'+(['右上角','右下角','左下角','左上角'][pos])+'二维码内容:'+value.result);
        	rs.result = value.result;
	        //根据宽高计算位置和大小
	        cb(null,rs);
		}
	});
};
Util.readCode2 = function(fileName,filePath,pos,cb){
	var rs = {
		has : false,
		pos : pos
	};
	//读取图片是否有二维码
	var buffer = fs.readFileSync(filePath);
	// fs.unlinkSync(filePath);
	Jimp.read(buffer).then(function(blockimg){
		var qr = new QrCode();
	    qr.callback = function(err2, value) {
	        if (err2) {
	        	//没有二维码
	        	Util.log('['+fileName+']'+(['右上角','右下角','左下角','左上角'][pos])+'无二维码');
	        	rs.has = false;
	        	rs.msg = '图片没有二维码';
	        	cb(null,rs);
	        }else{
	        	rs.has = true;
	        	Util.log('['+fileName+']'+(['右上角','右下角','左下角','左上角'][pos])+'二维码内容:'+value.result);
	        	rs.result = value.result;
		        //根据宽高计算位置和大小
		        cb(null,rs);
	        }
	    };
	    qr.decode(blockimg.bitmap);
	}).catch(function(err2){
		if(err2){
			Util.log(err2.toString());
			cb(err2);
		}
	});
}
//对图片进行裁切
Util.crop = function(fileName,filePath,targetPath,width,height,x,y,pos,callback){
	magick(filePath).crop(width,height,x,y)
	.resize(500)//缩放
	.colorspace('Gray')
	.sharpen(0,10)//锐化
	.blackThreshold('85%')
	.write(targetPath,function(err){
		if(err){
			Util.log(err.toString());
			callback(err);
		}else{
			Util.log('['+fileName+']截取'+(['右上角','右下角','左下角','左上角'][pos])+'图片成功');
			Util.readCode2(fileName,targetPath,pos,function(err2,rs){
				callback(err2,rs);
			});
		}
	})
};
Util.encodeStr = function(str){
	return (new Buffer(str)).toString('base64');
}
Util.decodeStr = function(str){
	return (new Buffer(str,'base64')).toString();
}
Util.encodeFileSync = function(filePath){//直接将源文件进行加密
	var buffer = fs.readFileSync(filePath);
	buffer.forEach(function(item,index){
		buffer[index] = item ^ 0XBB;
	});
	fs.writeFileSync(filePath,buffer);
	delete buffer;
}
Util.encodeFile = function(filePath,target,cb){
	var rs = fs.createReadStream(filePath);
	var os = fs.createWriteStream(target);
	rs.on('data',function(chunk){
		for(var i=0,max=chunk.length;i<max;i++){
			chunk[i] = chunk[i] ^ 0XBB;
		}
		os.write(chunk);
	})
	rs.on('end',function(){
		cb(null);
	});
	rs.on('error',function(err){
		cb(err,null);
	})
}
//获得旋转度数
Util.getDegree = function( arr ){
	//四个角，右上角和右下角有--，可能存在的情况 01 12 23 30，如果是单独的则是0 1 2 3 
	var target = ['01','12','23','03'];
	var num = 0;
	var ts = [];
	var str = [];//内容
	//排序
	arr.sort(function(a,b){
		return a.pos > b.pos;
	});
	arr.forEach(function( item ){
		if(item.has){
			ts.push(item.pos);
			str.push(item.result);
			num ++ ;
		}
	});
	//
	if(num == 1){//只有一个，肯定在右上角
		var temp = ts[0];
		var rs = {
			degree : -temp * 90,
			result : str
		};
		return rs;
	}else if(num == 2){
		var temp = ts.sort().join('');
		if(target.indexOf(temp)>-1){
			var rs = {
				degree : - target.indexOf(temp) * 90,
				result : temp === '03' ? str.reverse() : str
			};
			return rs;
		}
	}
	return {
		degree : 0,
		result : str
	};
};
//整理数据，提交到接口
Util.send = function(fileName,callback){
	/***
	 * 整理数据：
	 * 1.图片的创建时间
	 * 2.图片转移后的路径
	 * 3.二维码的内容
	 * 4.
	 ***/
	 var info = Util.cache[fileName];
	 var degree = info.degree;
	 var result = [''];
	 if(degree.result){
	 	result = degree.result;
	 }
	 //对文件和图片进行加密
	 var encFilePath = path.join(path.dirname(info.newPath),path.basename(info.newPath,path.extname(info.newPath))+'-enc'+path.extname(info.newPath));
	 var encThumbPath = path.join(path.dirname(info.thumb),path.basename(info.thumb,path.extname(info.thumb))+'-enc'+path.extname(info.thumb));
	 var data = {
	 	createTime : Util.encodeStr(info.time),
	 	fileTime : Util.encodeStr(info.fileTime),
	 	content0 : Util.encodeStr(result[0]),
	 	content1 : Util.encodeStr(result.length > 1 ? result[1] : '')
	 	// ,
	 	// filePath : info.newPath,
	 	// thumb : info.thumb
	 };
	 //判断识别出几个二维码
	 var num = 0;
	 if(data.content0 != ''){
	 	num ++;
	 }
	 if(data.content1 != ''){
	 	num ++;
	 }
	 Util.addCode(num);
	 Util.encodeFile(path.join(config.target,info.newPath),path.join(config.target,encFilePath),function(err,value){
	 	if(err){
	 		//加密失败，直接上传
	 		encFilePath = info.newPath;
	 	}
	 	Util.encodeFile(path.join(config.target,info.thumb),path.join(config.target,encThumbPath),function(err2,value2){
	 		if(err2){
	 			encThumbPath = info.thumb;
	 		}
	 		superagent
			 .post(config.upload)
			 //attach file
			 .attach('images',path.join(config.target,info.newPath))
			 .attach('images',path.join(config.target,info.thumb))
			 .end(function(err,res){
			 	if(err){
			 		Util.log('['+fileName+']调用上传接口失败'+err.toString());
			 		callback(err);
			 	}else{
			 		var txt = res.text;//获得返回的数据，一般为json格式
			 		var resObj = JSON.parse(txt);
			 		data.filePath = Util.encodeStr(resObj.filePath);
			 		data.thumb = Util.encodeStr(resObj.thumb);
					Util.log('['+fileName+']调用接口发送数据:'+JSON.stringify(data));
			 		superagent
			 		.post(config.api)
			 		.send(data)
			 		.end(function(err2,res2){
			 			if(err2){
					 		Util.log('['+fileName+']调用接口失败'+err2.toString());
					 		callback(err2);
					 	}else{
					 		// var txt = res.text;
					 		Util.log('['+fileName+']调用接口成功');
					 		//删除源文件
					 		if(fs.existsSync(info.filePath)){
					 			fs.unlinkSync(info.filePath);
					 		}
					 		if(fs.existsSync(path.join(config.target,info.newPath))){
					 			fs.unlinkSync(path.join(config.target,info.newPath));
					 		}
					 		if(fs.existsSync(path.join(config.target,info.thumb))){
					 			fs.unlinkSync(path.join(config.target,info.thumb));
					 		}
					 		if(fs.existsSync(path.join(config.target,encFilePath))){
					 			fs.unlinkSync(path.join(config.target,encFilePath));
					 		}
					 		if(fs.existsSync(path.join(config.target,encThumbPath))){
					 			fs.unlinkSync(path.join(config.target,encThumbPath));
					 		}
					 		Util.log('['+fileName+']删除源文件成功'+info.filePath);
					 		callback(null);
					 	}
			 		});
			 	}
			 });
	 	});
	 });
	 
}
//旋转
Util.rotate = function(fileName,callback){
	var info = Util.cache[fileName];
	if(info && info.degree){
		var filePath = info.filePath,degree = info.degree.degree;
		if(degree !== 0){
			magick(filePath).rotate('width',degree).write(filePath,function(err){
				if(err){
					Util.log('['+fileName+']旋转图片角度失败');
					callback(err);//即便是失败也要上传
				}else{
					Util.log('['+fileName+']旋转图片角度'+degree+'° 成功');
					callback(null,fileName);
				}
			});
		}else{
			callback(null,fileName);
		}
	}else{
		callback(null,fileName);	
	}
};
//图片分割并识别二维码
Util.split = function( fileName,callback ){
	var info = Util.cache[fileName];
	var filePath = info.filePath;
	//通过gm对文件进行分割成四个分片并保存
	setTimeout(function(){
		Jimp.read(filePath).then(function(image){
			var width = image.bitmap.width,height = image.bitmap.height;
			Util.log('['+fileName+']获得图片宽高：w='+width+'px;h='+height+'px');
			var hwidth = width /2 ,hheight = height /2 ;
			var targetPath = path.join(__dirname,'crop');
			var ext = path.extname(fileName);

			var rpath = path.join(targetPath,fileName+'-r'+info.extname);
			var bpath = path.join(targetPath,fileName+'-b'+info.extname);
			var lpath = path.join(targetPath,fileName+'-l'+info.extname);
			var tpath = path.join(targetPath,fileName+'-t'+info.extname);

			var hasCode = false;
			//同时进行
			async.parallel([
				function(callback){//右上角，根据宽高比对
					var a,b,c,d;
					if(width >= height){//横向
						a = width / 4;
						b = height /2 ;
						c = width /4 * 3;
						d = 0;
					}else{
						a = width /2;
						b = height /4;
						c = width /2;
						d = 0;
					}
					Util.crop(fileName,filePath,rpath,a,b,c,d,0,callback);
				},
				function(callback){//右下角
					var a,b,c,d;
					if(width >= height){//横向
						a = width /4;
						b = height /2;
						c = width /4 * 3;
						d = height /2;
					}else{
						a = width /2;
						b = height /4;
						c = width /2;
						d = height/4*3;
					}
					Util.crop(fileName,filePath,bpath,a,b,c,d,1,callback);
				},
				function(callback){//左下角
					var a,b,c,d;
					if(width >= height){//横向
						a = width /4;
						b = height /2;
						c = 0;
						d = height /2;
					}else{
						a = width /2;
						b = height /4;
						c = 0;
						d = height /4 *3;
					}
					Util.crop(fileName,filePath,lpath,a,b,c,d,2,callback);
				},
				function(callback){//左上角
					var a,b,c,d;
					if(width >= height){//横向
						a = width /4;
						b = height/2;
						c = 0;
						d = 0;
					}else{
						a = width /2;
						b = height/4;
						c = 0;
						d =0;
					}
					Util.crop(fileName,filePath,tpath,a,b,c,d,3,callback);
				}
			],function(err3,res){
				if(err3){
					Util.log(err3.toString());
					callback(err3);
				}else{
					var degree = Util.getDegree(res);//获得度数
					info.degree = degree;//设置度数信息和二维码内容
					Util.cache[fileName] = info;
					callback(null,fileName);	
				}
			});
		}).catch(function(err){
			if(err){
				Util.log(err.toString())
				callback(err);
			}
		});
	},500);
	

};

module.exports = Util;