package com.plucky775.routenote;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DocumentSaverPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
