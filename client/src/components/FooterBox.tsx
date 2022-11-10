import AddNetwork from "./AddNetwork"

import './styles/FooterBox.css'
import './styles/CopyToClipboard.css'

function copyToClipboard(): void {
    let copyText = document.getElementById("return-address-input") as HTMLInputElement
    copyText.select()
    copyText.setSelectionRange(0, 100)
    navigator.clipboard.writeText(copyText.value)
    
    let tooltip = document.getElementById("tooltip-text") as HTMLSpanElement
    tooltip.innerHTML = "Copied"
}

function outFunc(): void {
    let tooltip = document.getElementById("tooltip-text") as HTMLSpanElement
    tooltip.innerHTML = "Copy to clipboard"
}

export default function FooterBox(props: any) {
    return (
        <div className="container">
            <div className="footer-box">
                    <AddNetwork config={props.chainConfigs[props.chain!]} token={props.chainConfigs[props.token!]}/>
            </div>
        </div>
    )
}