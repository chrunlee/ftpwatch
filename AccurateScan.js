//循环读取图片的数据

//异步获得数据，某片区域

var async = require('async');
var Jimp = require('jimp');//bitmap
var config = require('./data');
var QrCode = require('qrcode-reader');//二维码读取
//精准扫描
function speedRead (filePath,callback){
	Jimp.read(filePath).then(function(image){
		var bitMap = image.bitmap;
		var imgWidth = bitMap.width,
			imgHeight = bitMap.height,
			imgData = bitMap.data;
		//根据宽度和间隔，指定不同的参数，进行同时异步请求
		var arr = getArray(imgWidth,imgHeight);
		//开始强势读取内容
		async.mapLimit(arr,3,function(item,cb){
			readCode(item,bitMap,cb)
		},function(err,value){
			// console.log(err);
			// console.log(value);
			delete bitMap;
			delete image;
			if(err && err.result){
				callback(null,err);
			}else{
				// console.log(value)
				console.log('扫描次数:'+value.length)
				callback('没有二维码','没有二维码');
			}
		});
	}).catch(function(err){
		callback(err,null);
	});
}
//根据位置获得对应的bitmap数据
function getBitMap(bitMap,x,y,width,height){
	var imgWidth = bitMap.width,
		imgHeight = bitMap.height,
		map = bitMap.data;
	//校验x,y,width,height
	var startX = x >= imgWidth ? imgWidth : x,
		startY = y >= imgHeight ? imgHeight : y,
		endX = x+width >= imgWidth ? imgWidth : x+width,
		endY = y+height >= imgHeight ? imgHeight : y+height;
	var rst = {
		data : [],
		width : endX - startX,
		height : endY - startY
	};

	for(var m=0;m<rst.height;m++){
		for(var n=0;n<rst.width*4;n++){
			// var index = (imgWidth * 4 * (y + m )) + (x*4 + n);
			// console.log(index);
			//对颜色进行处理

			rst.data[m*rst.width*4+n] = map[(imgWidth * 4 * (y + m)) + (x*4 + n)];
		}
	}
	return rst;
}
// function red(color) {
//     return (color >> 16) & 0xFF;
// }
// function green(color) {
//    return (color >> 8) & 0xFF;
// }

// function blue( color) {
//     return color & 0xFF;
// }
//扫描读取二维码
function readCode(item,bitMap,cb){
	var rst = getBitMap(bitMap,item.x,item.y,item.width,item.height);
	//测试：获得100,100,200,200的bitmap
	var qr = new QrCode();
    qr.callback = function(err2, value) {
    	delete rst;
        if (err2) {
        	//没有是正常的，如果有的话，直接报错
        	cb(null,null);
        }else{
        	cb(value,value);
        }
    };
    qr.decode(rst);
}
//根据宽度和间隔获得数组
function getArray ( imgWidth,imgHeight){
	var arr = [];
	var maxX = imgWidth <= config.qrWidth ? 0 : imgWidth - config.qrWidth;
	var maxY = imgHeight <= config.qrWidth ? 0 : imgHeight - config.qrWidth;
	for(var i=0;i<=maxY;i+=30){//行
		for(var j=0;j<=maxX;j+=30){//列
			//校验
			arr.push({
				x : j,
				y : i,
				width : maxX == 0 ? imgWidth : parseInt(config.qrWidth,10),
				height : maxY == 0 ? imgHeight : parseInt(config.qrWidth,10)
			});
		}
	}
	return arr;
}

module.exports = speedRead;
