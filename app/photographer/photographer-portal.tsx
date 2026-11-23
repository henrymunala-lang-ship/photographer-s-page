"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Profile = { id:string; name:string; email:string; bio:string; location:string; categories:string[]; profileImageUrl:string; heroImageUrl:string; status:string; publishState:string };
type Draft = { publicName:string; bio:string; location:string; categories:string; profileImageUrl:string; heroImageUrl:string };
const empty:Draft = { publicName:"", bio:"", location:"", categories:"", profileImageUrl:"", heroImageUrl:"" };

export default function PhotographerPortal() {
  const [profile,setProfile]=useState<Profile|null>(null), [draft,setDraft]=useState<Draft>(empty);
  const [loading,setLoading]=useState(true), [saving,setSaving]=useState(false), [uploading,setUploading]=useState<"profile"|"hero"|null>(null);
  const [message,setMessage]=useState(""), [error,setError]=useState("");
  async function load() {
    setLoading(true); setError("");
    try {
      const response=await fetch("/api/photographer/profile",{cache:"no-store"});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||"Your profile could not be loaded.");
      const p=data.photographer as Profile; setProfile(p);
      setDraft({publicName:p.name,bio:p.bio,location:p.location,categories:p.categories.join(", "),profileImageUrl:p.profileImageUrl,heroImageUrl:p.heroImageUrl});
    } catch(e) { setError(e instanceof Error?e.message:"Your profile could not be loaded."); }
    finally { setLoading(false); }
  }
  useEffect(()=>{void load();},[]);
  function field(key:keyof Draft,value:string){setDraft(current=>({...current,[key]:value}));}
  async function save(event:React.FormEvent) {
    event.preventDefault(); if(!profile||saving)return;
    setSaving(true);setError("");setMessage("");
    try {
      const response=await fetch("/api/photographer/profile",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({...draft,categories:draft.categories.split(",").map(v=>v.trim()).filter(Boolean)})});
      const data=await response.json(); if(!response.ok)throw new Error(data.error||"Profile could not be saved.");
      setProfile(current=>current?{...current,name:draft.publicName,bio:draft.bio,location:draft.location,categories:draft.categories.split(",").map(v=>v.trim()).filter(Boolean),profileImageUrl:draft.profileImageUrl,heroImageUrl:draft.heroImageUrl}:current);
      setMessage(data.unchanged?"Your profile is already up to date.":"Your profile has been saved. Changes are live on your public profile.");
    } catch(e){setError(e instanceof Error?e.message:"Profile could not be saved.");}
    finally{setSaving(false);}
  }
  async function upload(kind:"profile"|"hero",file?:File){
    if(!file||!profile)return;setUploading(kind);setError("");setMessage("");
    try{
      const form=new FormData();form.set("image",file);form.set("kind",kind);
      const response=await fetch("/api/photographer/profile/images",{method:"POST",body:form});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Image upload failed.");
      const key=kind==="profile"?"profileImageUrl":"heroImageUrl";setDraft(current=>({...current,[key]:data.url}));
      setProfile(current=>current?{...current,[key]:data.url}:current);
      setMessage(kind==="profile"?"Profile photo uploaded and published immediately.":"Cover photo uploaded and published immediately.");
    }catch(e){setError(e instanceof Error?e.message:"Image upload failed.");}
    finally{setUploading(null);}
  }
  async function logout(){await fetch("/api/photographer/auth/logout",{method:"POST"});window.location.href="/photographer/login";}
  return <main style={{minHeight:"100vh",background:"#f5f2ec",padding:"34px 18px 70px",color:"#25231f"}}>
    <div style={{maxWidth:920,margin:"0 auto"}}>
      <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:42}}>
        <Link href="/" style={{color:"inherit",textDecoration:"none",fontWeight:800,letterSpacing:".12em"}}>LENS & LIGHT</Link>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>{profile&&<Link href={"/photographers/"+encodeURIComponent(profile.id)} style={{color:"#665e51"}}>Public profile</Link>}<button onClick={logout} style={{padding:"9px 13px",background:"transparent",border:"1px solid #cfc7b8",cursor:"pointer"}}>Sign out</button></div>
      </header>
      <p style={{fontSize:11,letterSpacing:".18em",fontWeight:700,color:"#777064"}}>PHOTOGRAPHER WORKSPACE</p>
      <h1 style={{fontFamily:"Georgia,serif",fontWeight:400,fontSize:"clamp(34px,6vw,52px)",margin:"12px 0"}}>Your profile, <em>your story.</em></h1>
      <p style={{maxWidth:650,color:"#6d685f",lineHeight:1.7}}>Edit your public details and images. When you save, changes appear on your published profile immediately.</p>
      {loading?<p role="status">Loading your approved photographer profile…</p>:!profile?<section style={{background:"#fffdf9",padding:22,border:"1px solid #dedbd3",marginTop:24}}><p role="alert">{error}</p><p>If your profile has not been linked to an account yet, contact Lens & Light.</p><Link href="/photographer/login">Return to sign in</Link></section>:<>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",margin:"22px 0"}}><span style={pill}>{profile.status}</span><span style={pill}>{profile.publishState}</span><span style={{fontSize:12,color:"#777064",alignSelf:"center"}}>{profile.email}</span></div>
        {(message||error||uploading)&&<div role={error?"alert":"status"} style={{padding:14,margin:"16px 0",background:error?"#fff0ed":"#eef4eb",border:"1px solid "+(error?"#c77b70":"#9aaf91"),color:error?"#8d281d":"#31502c"}}>{uploading?("Uploading "+(uploading==="profile"?"profile photo":"cover photo")+"…"):error||message}</div>}
        <form onSubmit={save} style={{background:"#fffdf9",border:"1px solid #dedbd3",padding:"clamp(16px,4vw,28px)",borderRadius:8}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:16}}>
            <label style={label}>Public name<input style={input} value={draft.publicName} onChange={e=>field("publicName",e.target.value)} maxLength={120} required/></label>
            <label style={label}>Primary location<input style={input} value={draft.location} onChange={e=>field("location",e.target.value)} maxLength={160}/></label>
            <label style={{...label,gridColumn:"1 / -1"}}>Biography<textarea style={{...input,minHeight:130}} value={draft.bio} onChange={e=>field("bio",e.target.value)} maxLength={5000}/></label>
            <label style={{...label,gridColumn:"1 / -1"}}>Photography categories<input style={input} value={draft.categories} onChange={e=>field("categories",e.target.value)} placeholder="Portrait, Wedding, Events"/></label>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:18,marginTop:24}}>
            {(["profile","hero"] as const).map(kind=>{const key=kind==="profile"?"profileImageUrl":"heroImageUrl";return <section key={kind} style={{border:"1px solid #dedbd3",padding:14}}>
              <h2 style={{fontSize:16,fontWeight:600}}>{kind==="profile"?"Profile photo":"Cover / hero photo"}</h2>
              {draft[key]&&<img src={draft[key]} alt={kind==="profile"?"Profile photo preview":"Cover photo preview"} style={{width:"100%",height:190,objectFit:"cover",margin:"8px 0"}}/>}
              <label style={label}>Paste an HTTPS image URL<input style={input} type="url" value={draft[key]} onChange={e=>field(key,e.target.value)} placeholder="https://…"/></label>
              <label style={{...label,marginTop:12}}>Or upload from phone / computer<input style={{...input,padding:8}} type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading!==null} onChange={e=>{const file=e.target.files?.[0];void upload(kind,file);e.currentTarget.value="";}}/></label>
              <small style={{color:"#777064",lineHeight:1.6}}>JPG, PNG or WebP · Up to 8 MB · Stored in Google Drive. Uploads update your public profile immediately.</small>
            </section>;})}
          </div>
          <div style={{display:"flex",gap:14,alignItems:"center",flexWrap:"wrap",marginTop:24}}>
            <button disabled={saving||uploading!==null} style={{padding:"13px 20px",background:"#292821",color:"white",border:0,cursor:"pointer"}}>{saving?"Saving…":"Save profile changes"}</button>
            <span style={{fontSize:12,color:"#777064"}}>Approval and publication settings cannot be changed here.</span>
          </div>
        </form>
      </>}
    </div>
  </main>;
}
const pill:React.CSSProperties={fontSize:11,letterSpacing:".06em",padding:"6px 10px",border:"1px solid #d6d0c4",background:"#fffdf9"};
const label:React.CSSProperties={display:"grid",gap:7,fontSize:12,fontWeight:700};
const input:React.CSSProperties={width:"100%",boxSizing:"border-box",padding:11,border:"1px solid #d4cec3",background:"#fff",font:"inherit",fontWeight:400};
