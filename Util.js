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

var Util = {
	cache : {},//存放每一个图片的具体信息
	error : {},//存放错误的具体信息
	delay : {}//存放延迟处理的文件夹集合
};


/**
 * 错误机制
 * 1. 将错误的图片放在内存中
 * 2. 定时去处理错误的信息(比如五分钟处理一次？或者一分钟检查一次)
 * 3. 将成功后的文件消灭掉，并更新
 **/


//添加错误信息
Util.pushError = function( fileName ){
	var info = Util.cache[fileName];
	if(info){
		//判断error中是否存在
		if(Util.error[fileName]){
			info.error = info.error + 1;
			Util.error[fileName] = info;
			if(info.error > 3){
				Util.deleteError(fileName);
			}
		}else{
			info.error = 1;
			Util.error[fileName] = info;
		}
	}
};
//删除错误信息
Util.deleteError = function( fileName ){
	var info = Util.error[fileName];
	if(info){
		Util.error[fileName] = null;
		delete Util.error[fileName];
	}
};
//获得第一个错误信息
Util.getError = function(){
	var first = null;
	for(var key in Util.error){
		if(key && Util.error[key]){
			first =key;
			break;
		}
	}
	return first;
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
	// console.log(info);
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
	var buffer = fs.readFileSync(filePath);
	fs.unlinkSync(filePath);
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
};
//对图片进行裁切
Util.crop = function(fileName,filePath,targetPath,width,height,x,y,pos,callback){
	magick(filePath).crop(width,height,x,y)
	.contrast(0)
	.resize(1500)
	// .sharpen(0,10)
	// .whiteThreshold(50,50,50)
	.threshold('75%')
	.write(targetPath,function(err){
		if(err){
			Util.log(err.toString());
			callback(err);
		}else{
			Util.log('['+fileName+']截取'+(['右上角','右下角','左下角','左上角'][pos])+'图片成功');
			Util.readCode(fileName,targetPath,pos,function(err2,rs){
				callback(err2,rs);
			});
		}
	})
};
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
	 var data = {
	 	createTime : info.time,
	 	content0 : result[0],
	 	content1 : result.length > 1 ? result[1] : '',
	 	filePath : info.newPath,
	 	thumb : info.thumb
	 };
	 Util.log('['+fileName+']调用接口发送数据:'+JSON.stringify(data));
	 superagent
	 .post(config.upload)
	 //attach file
	 .attach('file',path.join(config.target,info.newPath))
	 .attach('thumb',path.join(config.target,info.thumb))
	 .end(function(err,res){
	 	if(err){
	 		Util.log('['+fileName+']调用上传接口失败'+err.toString());
	 		callback(err);
	 	}else{
	 		var txt = res.text;//获得返回的数据，一般为json格式
	 		var resObj = JSON.parse(txt);
	 		data.filePath = resObj.filePath;
	 		data.thumb = resObj.thumb;
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
			 		fs.unlinkSync(info.filePath);
			 		Util.log('['+fileName+']删除源文件成功'+info.filePath);
			 		callback(null);
			 	}
	 		});
	 	}
	 });
	 // superagent
	 // .post(config.api)
	 // // .send(data)
	 // .field('createTime',info.time)
	 // .field('content0',result[0])
	 // .field('content1',result.length >1 ? result[1] : '')
	 // //attach file
	 // .attach('file',path.join(config.target,info.newPath))
	 // .attach('thumb',path.join(config.target,info.thumb))
	 // .end(function(err,res){
	 // 	if(err){
	 // 		Util.log('['+fileName+']调用接口失败'+err.toString());
	 // 		callback(err);
	 // 	}else{
	 // 		// var txt = res.text;
	 // 		Util.log('['+fileName+']调用接口成功');
	 // 		//删除源文件
	 // 		fs.unlinkSync(info.filePath);
	 // 		Util.log('['+fileName+']删除源文件成功'+info.filePath);
	 // 		callback(null);
	 // 	}
	 // });
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