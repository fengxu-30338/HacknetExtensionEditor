# Change Log

## V0.0.4更新日志 - 2025-08-29

1. 修复AddMissionToHubServer标签在不同任务系统中的不同提示。在玩家选择非DHS服务中表示是否添加到任务中心的顶部，提供枚举选择，在玩家选择含有dhs服务的计算机id时，表示是谁领取了任务，将提供玩家定义的所有dhs agent用户供玩家选择。
2. HackerScripts新增命令systakeover命令高亮及提示。

更新后您需要手动重新创建编辑器提示文件才有最新提示，如果您在原本的提示文件中新增了内容，那么请您做好备份。



## V0.0.3更新日志 - 2025-08-29

xml提示文件`Hacknet-EditorHint.xml`新增Include标签可引用其他提示文件。您可以在您项目中使用的其他mod单独写一份提示文件，以供其他人使用。

> 示例

```xml
<!-- 假设该文件位于项目相对路径的 Test/Test.xml中 -->
<HacknetEditorHint>
    <Node name="Test" enable="true" multi="false" desc="测试新增提示文件">
        <Content />
    </Node>
</HacknetEditorHint>


<!-- 下面的文件内容位于Hacknet-EditorHint.xml文件中，引用上面定义的Test.xml文件即可 -->
<HacknetEditorHint>
    <!-- XXX这里有一些提示的东西此处省略 -->
    <!-- 此处引用写的其他的提示文件，使用项目根目录的相对路径 -->
	<Include path="Test/Test.xml" />
</HacknetEditorHint>
```





## V0.0.2更新日志 - 2025-08-28

**新增在线调试主题功能**

您可以在主题的xml文件右下角点击调试主题按钮来在线调试主题

![](F:\NodeJs\hacknetextensionhelper\imgs\img10.jpg)

点击后会在侧边栏弹出网页模拟的界面，您更改xml后可立即在网页看到效果。

更方便的是，您在鼠标在网页想改的元素处停留3秒以上，该元素用到的颜色会在左侧xml文件中高亮出来，以便您能够更精准的定位到想要改的标签。