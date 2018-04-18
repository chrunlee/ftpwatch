//测试

var Util = require('./Util');
var gm = require('gm');//图片操作
var test = 'd:/pictest/aa.jpg';
var test2 = 'd:/pictest/aa-thumb.jpg';
var magick = gm.subClass({imageMagick : true});//实体

magick(test)
//.resize('428')
.density(96).write(test2,function(err){
	console.log(err);
	console.log('aa');
})
// Util.readCode('test',test,1,function(err,rs){
// 	if(err){
// 		console.log(err);
// 		return;
// 	}
// 	console.log(rs);
// });

// magick(test).rotate('width',90).write(test,function(err){});
// magick(test).resize(2000).write(test,function(err){});

// magick(test)
// 	// .crop(width,height,x,y)
// 	// .contrast(-10)
// 	// .resize(1000)
// 	// .whiteThreshold(55)
// 	.threshold('55%')
// 	.write(test2,function(err){
		
// 	})

/**
固定像素--2800 * 3500
固定二维码大小，固定二维码区域
2480 * 3508 
2：3
29.7：21
6cm的宽度和高度
对应像素为:700,宽高700像素，在其中读取二维码
**/
 
// var Jimp = require('jimp');//bitmap
// var fs = require('fs');
// Jimp.read(test).then(function(blockimg){
// 	console.log(blockimg);
// 	var bitmap = blockimg.bitmap;
// 	console.log(bitmap);
// 	var data = bitmap.data;
// 	fs.writeFile(__dirname+'/test.jpg',data,function(err){
// 		console.log('over')
// 	});
// });


// function getCode(filePath){
// 	//获得图片宽高，设定二维码宽高，开始位置以及
// 	Jimp.read(filePath)
// }

// var test333 = '';
// Jimp.read(test).then(function(blockimg){
// 	blockimg.crop(0,0,300,300).getBuffer(Jimp.AUTO,function(err,data){
// 		//写入文件
// 		Jimp.read(data).then(function(bk){
// 			console.log(bk);
// 		});
// 		fs.writeFile('E:/node/ftpwatch/crop/aa.jpg',data,function(err){
// 			console.log(err);
// 		})
// 	});
// });