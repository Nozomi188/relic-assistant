param([string]$WindowHandle,[int]$ParentId)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
public static class RelicRightClick {
  delegate IntPtr HookProc(int code,IntPtr message,IntPtr data);
  static HookProc callback=Handle;
  static IntPtr hook, window;
  static volatile bool armed=true;
  static bool captured;
  [StructLayout(LayoutKind.Sequential)] struct POINT {public int X,Y;}
  [StructLayout(LayoutKind.Sequential)] struct RECT {public int Left,Top,Right,Bottom;}
  [StructLayout(LayoutKind.Sequential)] struct MOUSE {public POINT Point;public uint MouseData,Flags,Time;public UIntPtr Extra;}
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id,HookProc proc,IntPtr module,uint thread);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr value);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr value,int code,IntPtr message,IntPtr data);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd,out RECT rect);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("kernel32.dll",CharSet=CharSet.Auto)] static extern IntPtr GetModuleHandle(string name);
  static IntPtr Handle(int code,IntPtr message,IntPtr data) {
    int msg=message.ToInt32();
    if(code>=0 && (msg==0x204 || msg==0x205)) {
      if(msg==0x204 && armed && IsWindowVisible(window)) {
        MOUSE mouse=(MOUSE)Marshal.PtrToStructure(data,typeof(MOUSE)); RECT rect;
        if(GetWindowRect(window,out rect) && mouse.Point.X>=rect.Left && mouse.Point.X<rect.Right && mouse.Point.Y>=rect.Top && mouse.Point.Y<rect.Bottom) captured=true;
      }
      if(captured) {
        if(msg==0x205){captured=false;armed=false;Console.WriteLine("MENU");Console.Out.Flush();}
        return new IntPtr(1);
      }
    }
    return CallNextHookEx(hook,code,message,data);
  }
  public static void Run(long handle,int parent) {
    SetProcessDPIAware();window=new IntPtr(handle);
    hook=SetWindowsHookEx(14,callback,GetModuleHandle(null),0);
    if(hook==IntPtr.Zero)throw new Exception("Mouse hook initialization failed");
    var reader=new Thread(()=>{string line;while((line=Console.ReadLine())!=null){if(line=="ARM")armed=true;if(line=="STOP")Environment.Exit(0);}Environment.Exit(0);});reader.IsBackground=true;reader.Start();
    var timer=new System.Windows.Forms.Timer();timer.Interval=1500;timer.Tick+=(sender,args)=>{try{if(Process.GetProcessById(parent).HasExited)Application.Exit();}catch{Application.Exit();}};timer.Start();
    Console.WriteLine("READY");Console.Out.Flush();
    try{Application.Run();}finally{timer.Stop();UnhookWindowsHookEx(hook);}
  }
}
'@
[RelicRightClick]::Run([long]$WindowHandle,$ParentId)
